from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Response, Header, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt as pyjwt
import requests
from pymongo import ReturnDocument

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Config
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
JWT_EXPIRE_HOURS = 24 * 7
ADMIN_EMAIL = os.environ['ADMIN_EMAIL']
ADMIN_PASSWORD = os.environ['ADMIN_PASSWORD']
BRAND_NAME = os.environ.get('BRAND_NAME', 'sabewell')
PUBLIC_APP_URL = os.environ.get('PUBLIC_APP_URL', '')

# Twilio (optional)
TWILIO_SID = os.environ.get('TWILIO_ACCOUNT_SID', '')
TWILIO_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN', '')
TWILIO_FROM = os.environ.get('TWILIO_WHATSAPP_FROM', '')
TWILIO_CONTENT_SID = os.environ.get('TWILIO_CONTENT_SID', '')
TWILIO_SMS_FROM = os.environ.get('TWILIO_SMS_FROM', '')

# Fast2SMS WhatsApp
FAST2SMS_API_KEY = os.environ.get('FAST2SMS_API_KEY', '')
FAST2SMS_WHATSAPP_MESSAGE_ID = os.environ.get('FAST2SMS_WHATSAPP_MESSAGE_ID', '')

# Emergent Object Storage
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
APP_NAME = os.environ.get('APP_NAME', 'sabewell')
_storage_key: Optional[str] = None
ALLOWED_IMAGE_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_PHOTOS_PER_COMPLAINT = 5

app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ---------- Models ----------
StatusType = Literal["Pending", "In Progress", "Resolved"]
ALLOWED_STATUSES = ("Pending", "In Progress", "Resolved")
WarrantyType = Literal["Warranted", "Unwarranted"]
ALLOWED_WARRANTY = ("Warranted", "Unwarranted")


class StatusHistoryEntry(BaseModel):
    status: StatusType
    note: Optional[str] = None
    at: str


class Complaint(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    complaint_id: str
    name: str
    address: str
    phone: str
    village: Optional[str] = ""
    city: Optional[str] = ""
    district: Optional[str] = ""
    state: Optional[str] = ""
    pincode: Optional[str] = ""
    invoice_number: Optional[str] = ""
    product_details: Optional[str] = ""
    product_serial: str
    issue_description: str
    date: str  # ISO date string (YYYY-MM-DD)
    status: StatusType = "Pending"
    warranty: WarrantyType = "Warranted"
    status_history: List[StatusHistoryEntry] = Field(default_factory=list)
    photos: List[dict] = Field(default_factory=list)
    created_at: str
    updated_at: str


class ComplaintCreate(BaseModel):
    name: str
    address: str
    phone: str
    product_serial: str
    issue_description: str
    village: Optional[str] = ""
    city: Optional[str] = ""
    district: Optional[str] = ""
    state: Optional[str] = ""
    pincode: Optional[str] = ""
    invoice_number: Optional[str] = ""
    product_details: Optional[str] = ""
    warranty: WarrantyType = "Warranted"
    date: Optional[str] = None


class Customer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    phone: str  # unique key
    name: str
    address: Optional[str] = ""
    village: Optional[str] = ""
    city: Optional[str] = ""
    district: Optional[str] = ""
    state: Optional[str] = ""
    pincode: Optional[str] = ""
    created_at: str
    updated_at: str


class CustomerUpsert(BaseModel):
    name: str
    address: Optional[str] = ""
    village: Optional[str] = ""
    city: Optional[str] = ""
    district: Optional[str] = ""
    state: Optional[str] = ""
    pincode: Optional[str] = ""


class ComplaintWarrantyUpdate(BaseModel):
    warranty: WarrantyType


class CustomerPhoneChange(CustomerUpsert):
    phone: Optional[str] = None  # new phone if changing


class ComplaintStatusUpdate(BaseModel):
    status: StatusType
    note: Optional[str] = None


class LoginInput(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: str


# ---------- Helpers ----------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_token(email: str) -> str:
    payload = {
        "sub": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def current_admin(cred: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> str:
    if cred is None:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = pyjwt.decode(cred.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
        return email
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def generate_complaint_id() -> str:
    """Generate a globally-incrementing ID: {month}{year}{seq:04d} e.g. 520260001."""
    now = datetime.now(timezone.utc)
    # Global counter, increments regardless of month/year change
    counter = await db.counters.find_one_and_update(
        {"_id": "complaint_global"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    seq = counter["seq"]
    return f"{now.month}{now.year}{seq:04d}"


def send_whatsapp(to_phone: str, body: str, content_variables=None) -> bool:
    """Send a WhatsApp message via Twilio. Returns True on success, False if skipped/failed.

    If TWILIO_CONTENT_SID is set and content_variables provided, uses the pre-approved
    Content Template; otherwise sends the freeform `body`.
    """
    if not (TWILIO_SID and TWILIO_TOKEN and TWILIO_FROM):
        logger.info("Twilio creds not set; skipping WhatsApp send")
        return False
    try:
        import json as _json
        from twilio.rest import Client as TwilioClient
        twilio_client = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
        to = to_phone.strip()
        if not to.startswith("whatsapp:"):
            if not to.startswith("+"):
                to = "+" + to
            to = f"whatsapp:{to}"
        from_ = TWILIO_FROM if TWILIO_FROM.startswith("whatsapp:") else f"whatsapp:{TWILIO_FROM}"

        if TWILIO_CONTENT_SID and content_variables:
            msg = twilio_client.messages.create(
                content_sid=TWILIO_CONTENT_SID,
                content_variables=_json.dumps({str(k): str(v) for k, v in content_variables.items()}),
                from_=from_,
                to=to,
            )
        else:
            msg = twilio_client.messages.create(body=body, from_=from_, to=to)
        logger.info(f"WhatsApp sent: sid={msg.sid} status={msg.status}")
        return True
    except Exception as e:
        logger.warning(f"WhatsApp send failed: {e}")
        return False


def send_whatsapp_fast2sms(to_phone: str, variables: list) -> tuple[bool, str]:
    """Send a WhatsApp template message via Fast2SMS. Returns (success, message)."""
    if not (FAST2SMS_API_KEY and FAST2SMS_WHATSAPP_MESSAGE_ID):
        logger.info("Fast2SMS WhatsApp not configured (missing API key or template message_id)")
        return False, "Fast2SMS not configured"
    # Fast2SMS expects the recipient as 10-digit Indian mobile (no country code) or full international
    normalized = normalize_phone(to_phone)
    # Strip the +91 prefix for Fast2SMS (it expects 10-digit for Indian numbers)
    mobile = normalized
    if mobile.startswith("+91") and len(mobile) == 13:
        mobile = mobile[3:]
    elif mobile.startswith("+"):
        mobile = mobile[1:]
    try:
        resp = requests.post(
            "https://www.fast2sms.com/dev/whatsapp/send",
            headers={
                "authorization": FAST2SMS_API_KEY,
                "content-type": "application/json",
            },
            json={
                "message_id": FAST2SMS_WHATSAPP_MESSAGE_ID,
                "mobile_number": mobile,
                "variable_values": [str(v) for v in variables],
            },
            timeout=30,
        )
        data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        if resp.ok and data.get("success"):
            logger.info(f"Fast2SMS WhatsApp sent to {mobile}: {data}")
            return True, f"WhatsApp sent to {mobile}"
        err = data.get("message") or resp.text or f"HTTP {resp.status_code}"
        logger.warning(f"Fast2SMS WhatsApp failed: {err}")
        return False, str(err)[:200]
    except Exception as e:
        logger.warning(f"Fast2SMS WhatsApp error: {e}")
        return False, str(e)[:200]


def normalize_phone(raw: str) -> str:
    """Normalize a phone to E.164. Handles common Indian patterns."""
    if not raw:
        return raw
    p = raw.strip().replace(" ", "").replace("-", "")
    if p.startswith("+"):
        return p
    # 10 digits starting with 6-9 → Indian mobile
    if len(p) == 10 and p[0] in "6789":
        return f"+91{p}"
    # 12 digits starting with 91 → Indian with country code, missing +
    if len(p) == 12 and p.startswith("91"):
        return f"+{p}"
    # 11 digits starting with 0 → strip leading 0 and try Indian
    if len(p) == 11 and p.startswith("0") and p[1] in "6789":
        return f"+91{p[1:]}"
    # Fallback: add + so Twilio validates it (and surfaces a clean error if invalid)
    return f"+{p}"


def send_sms(to_phone: str, body: str) -> tuple[bool, str]:
    """Send a plain SMS via Twilio. Returns (success, message)."""
    if not (TWILIO_SID and TWILIO_TOKEN and TWILIO_SMS_FROM):
        logger.info("Twilio SMS creds not set; skipping SMS send")
        return False, "SMS not configured"
    try:
        from twilio.rest import Client as TwilioClient
        twilio_client = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
        to = normalize_phone(to_phone)
        msg = twilio_client.messages.create(body=body, from_=TWILIO_SMS_FROM, to=to)
        logger.info(f"SMS sent: sid={msg.sid} status={msg.status} to={to}")
        return True, f"SMS sent to {to}"
    except Exception as e:
        err = str(e)
        # Extract human message from Twilio error
        if "unverified" in err.lower():
            short = "Recipient not verified on Twilio (trial account)"
        elif "Invalid" in err and "Phone Number" in err:
            short = "Invalid phone number format"
        else:
            # Take last 200 chars of error to avoid huge messages
            short = err.split(":")[-1].strip()[:200]
        logger.warning(f"SMS send failed: {err}")
        return False, short


def build_tracking_url(complaint_id: str) -> str:
    base = PUBLIC_APP_URL.rstrip("/") if PUBLIC_APP_URL else ""
    return f"{base}/track/{complaint_id}"


# ---------- Object Storage ----------
def init_storage() -> Optional[str]:
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_KEY:
        logger.warning("EMERGENT_LLM_KEY not set; storage disabled")
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        resp.raise_for_status()
        _storage_key = resp.json()["storage_key"]
        logger.info("Object storage initialized")
        return _storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None


def storage_put(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Storage unavailable")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 403:
        # Re-init and retry once
        globals()["_storage_key"] = None
        key = init_storage()
        if not key:
            raise HTTPException(status_code=503, detail="Storage unavailable")
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def storage_get(path: str) -> tuple[bytes, str]:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Storage unavailable")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    if resp.status_code == 403:
        globals()["_storage_key"] = None
        key = init_storage()
        if not key:
            raise HTTPException(status_code=503, detail="Storage unavailable")
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=60,
        )
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="File not found")
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"service": f"{BRAND_NAME} complaint tracker", "status": "ok"}


@api_router.post("/auth/login", response_model=TokenResponse)
async def login(payload: LoginInput):
    admin = await db.admins.find_one({"email": payload.email.lower()}, {"_id": 0})
    if not admin or not verify_password(payload.password, admin["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(admin["email"])
    return TokenResponse(access_token=token, email=admin["email"])


@api_router.get("/auth/me")
async def me(email: str = Depends(current_admin)):
    return {"email": email}


@api_router.post("/complaints")
async def create_complaint(body: ComplaintCreate, _: str = Depends(current_admin)):
    cid = await generate_complaint_id()
    today = body.date or datetime.now(timezone.utc).date().isoformat()
    now = now_iso()
    phone = normalize_phone(body.phone.strip())
    complaint = Complaint(
        complaint_id=cid,
        name=body.name.strip(),
        address=body.address.strip(),
        phone=phone,
        village=(body.village or "").strip(),
        city=(body.city or "").strip(),
        district=(body.district or "").strip(),
        state=(body.state or "").strip(),
        pincode=(body.pincode or "").strip(),
        invoice_number=(body.invoice_number or "").strip(),
        product_details=(body.product_details or "").strip(),
        product_serial=body.product_serial.strip(),
        issue_description=body.issue_description.strip(),
        date=today,
        status="Pending",
        warranty=body.warranty,
        status_history=[StatusHistoryEntry(status="Pending", note="Complaint registered", at=now)],
        created_at=now,
        updated_at=now,
    )
    doc = complaint.model_dump()
    await db.complaints.insert_one(doc)

    # Upsert customer profile (one per phone)
    await db.customers.update_one(
        {"phone": phone},
        {
            "$set": {
                "phone": phone,
                "name": complaint.name,
                "address": complaint.address,
                "village": complaint.village,
                "city": complaint.city,
                "district": complaint.district,
                "state": complaint.state,
                "pincode": complaint.pincode,
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )

    # Notify customer via SMS (WhatsApp disabled per request)
    track_url = build_tracking_url(cid)
    body_msg = (
        f"Hello {complaint.name}, your complaint has been registered with {BRAND_NAME}.\n"
        f"Complaint ID: {cid}\n"
        f"Status: Pending\n"
        f"Track here: {track_url}"
    )
    sms_ok, sms_msg = send_sms(phone, body_msg)
    wa_ok, wa_msg = send_whatsapp_fast2sms(
        phone,
        [complaint.name, cid, "Pending", track_url],
    )
    result = complaint.model_dump()
    result["sms_status"] = {"ok": sms_ok, "message": sms_msg}
    result["whatsapp_status"] = {"ok": wa_ok, "message": wa_msg}
    return result


# (Status update notification also returns SMS status — see update_status below)


@api_router.get("/complaints", response_model=List[Complaint])
async def list_complaints(
    status_filter: Optional[str] = None,
    q: Optional[str] = None,
    _: str = Depends(current_admin),
):
    query: dict = {}
    if status_filter and status_filter in ALLOWED_STATUSES:
        query["status"] = status_filter
    if q:
        rx = {"$regex": q, "$options": "i"}
        query["$or"] = [
            {"complaint_id": rx},
            {"name": rx},
            {"phone": rx},
            {"product_serial": rx},
            {"invoice_number": rx},
            {"product_details": rx},
            {"issue_description": rx},
            {"address": rx},
            {"village": rx},
            {"city": rx},
            {"district": rx},
            {"state": rx},
            {"pincode": rx},
        ]
    cursor = db.complaints.find(query, {"_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(1000)
    return items


@api_router.get("/complaints/{cid}", response_model=Complaint)
async def get_complaint(cid: str, _: str = Depends(current_admin)):
    doc = await db.complaints.find_one({"complaint_id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return doc


@api_router.patch("/complaints/{cid}/status")
async def update_status(cid: str, body: ComplaintStatusUpdate, _: str = Depends(current_admin)):
    if body.status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    doc = await db.complaints.find_one({"complaint_id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Complaint not found")
    if doc["status"] == body.status:
        raise HTTPException(status_code=400, detail="Status unchanged")
    now = now_iso()
    new_entry = {"status": body.status, "note": body.note or "", "at": now}
    await db.complaints.update_one(
        {"complaint_id": cid},
        {
            "$set": {"status": body.status, "updated_at": now},
            "$push": {"status_history": new_entry},
        },
    )
    doc["status"] = body.status
    doc["updated_at"] = now
    doc["status_history"].append(new_entry)

    # Notify customer
    track_url = build_tracking_url(cid)
    body_msg = (
        f"Hi {doc['name']}, update on your complaint with {BRAND_NAME}.\n"
        f"Complaint ID: {cid}\n"
        f"New status: {body.status}\n"
        + (f"Note: {body.note}\n" if body.note else "")
        + f"Track here: {track_url}"
    )
    send_sms_ok, send_sms_msg = send_sms(doc["phone"], body_msg)
    wa_ok, wa_msg = send_whatsapp_fast2sms(
        doc["phone"],
        [doc["name"], cid, body.status, track_url],
    )
    doc["sms_status"] = {"ok": send_sms_ok, "message": send_sms_msg}
    doc["whatsapp_status"] = {"ok": wa_ok, "message": wa_msg}
    return doc


@api_router.delete("/complaints/{cid}")
async def delete_complaint(cid: str, _: str = Depends(current_admin)):
    doc = await db.complaints.find_one({"complaint_id": cid}, {"_id": 0, "phone": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Complaint not found")
    phone = doc.get("phone", "")
    await db.complaints.delete_one({"complaint_id": cid})
    # Auto-delete customer if they have no complaints left
    if phone:
        remaining = await db.complaints.count_documents({"phone": phone})
        if remaining == 0:
            await db.customers.delete_one({"phone": phone})
    return {"ok": True}


@api_router.patch("/complaints/{cid}/warranty", response_model=Complaint)
async def update_warranty(cid: str, body: ComplaintWarrantyUpdate, _: str = Depends(current_admin)):
    if body.warranty not in ALLOWED_WARRANTY:
        raise HTTPException(status_code=400, detail="Invalid warranty value")
    doc = await db.complaints.find_one({"complaint_id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Complaint not found")
    now = now_iso()
    await db.complaints.update_one(
        {"complaint_id": cid},
        {"$set": {"warranty": body.warranty, "updated_at": now}},
    )
    doc["warranty"] = body.warranty
    doc["updated_at"] = now
    return doc


# ---------- Customer endpoints ----------
def _customer_clean(c: dict) -> dict:
    """Strip MongoDB internals and ensure all fields present."""
    keys = ["phone", "name", "address", "village", "city", "district", "state", "pincode", "created_at", "updated_at"]
    out = {k: c.get(k, "") for k in keys}
    return out


@api_router.get("/customers/by-phone/{phone}")
async def get_customer_by_phone(phone: str, _: str = Depends(current_admin)):
    """Auto-lookup customer by phone. Falls back to recent complaint if no customer record yet."""
    phone = phone.strip()
    cust = await db.customers.find_one({"phone": phone}, {"_id": 0})
    if cust:
        return {"found": True, "customer": _customer_clean(cust)}
    # Fallback: synthesize from most recent matching complaint
    complaint = await db.complaints.find_one({"phone": phone}, {"_id": 0}, sort=[("created_at", -1)])
    if complaint:
        now = now_iso()
        synth = {
            "phone": phone,
            "name": complaint.get("name", ""),
            "address": complaint.get("address", ""),
            "village": complaint.get("village", ""),
            "city": complaint.get("city", ""),
            "district": complaint.get("district", ""),
            "state": complaint.get("state", ""),
            "pincode": complaint.get("pincode", ""),
            "created_at": now,
            "updated_at": now,
        }
        # Lazy-create the customer record
        await db.customers.update_one(
            {"phone": phone},
            {"$set": synth, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        return {"found": True, "customer": synth, "source": "historical"}
    return {"found": False}


@api_router.post("/customers/_backfill")
async def backfill_customers(_: str = Depends(current_admin)):
    """Reconcile any complaint phones that don't have a customer record."""
    existing_phones = set()
    async for c in db.customers.find({}, {"_id": 0, "phone": 1}):
        existing_phones.add(c["phone"])
    seen = set()
    backfilled = 0
    async for cp in db.complaints.find({}, {"_id": 0}).sort("created_at", -1):
        phone = (cp.get("phone") or "").strip()
        if not phone or phone in seen or phone in existing_phones:
            continue
        seen.add(phone)
        now = now_iso()
        await db.customers.update_one(
            {"phone": phone},
            {
                "$set": {
                    "phone": phone,
                    "name": cp.get("name", ""),
                    "address": cp.get("address", ""),
                    "village": cp.get("village", ""),
                    "city": cp.get("city", ""),
                    "district": cp.get("district", ""),
                    "state": cp.get("state", ""),
                    "pincode": cp.get("pincode", ""),
                    "updated_at": cp.get("updated_at", now),
                },
                "$setOnInsert": {"created_at": cp.get("created_at", now)},
            },
            upsert=True,
        )
        backfilled += 1
    return {"backfilled": backfilled}


@api_router.get("/customers")
async def list_customers(q: Optional[str] = None, _: str = Depends(current_admin)):
    # Lazy reconcile: ensure every complaint phone has a customer record
    existing_phones = set()
    async for c in db.customers.find({}, {"_id": 0, "phone": 1}):
        existing_phones.add(c["phone"])
    seen = set()
    async for cp in db.complaints.find({}, {"_id": 0}).sort("created_at", -1):
        phone = (cp.get("phone") or "").strip()
        if not phone or phone in seen or phone in existing_phones:
            continue
        seen.add(phone)
        now = now_iso()
        await db.customers.update_one(
            {"phone": phone},
            {
                "$set": {
                    "phone": phone,
                    "name": cp.get("name", ""),
                    "address": cp.get("address", ""),
                    "village": cp.get("village", ""),
                    "city": cp.get("city", ""),
                    "district": cp.get("district", ""),
                    "state": cp.get("state", ""),
                    "pincode": cp.get("pincode", ""),
                    "updated_at": cp.get("updated_at", now),
                },
                "$setOnInsert": {"created_at": cp.get("created_at", now)},
            },
            upsert=True,
        )

    # Prune: delete any customers with zero complaints
    phones_with_complaints = set()
    async for row in db.complaints.aggregate([{"$group": {"_id": "$phone"}}]):
        if row["_id"]:
            phones_with_complaints.add(row["_id"])
    await db.customers.delete_many({"phone": {"$nin": list(phones_with_complaints)}})

    query: dict = {}
    if q:
        rx = {"$regex": q, "$options": "i"}
        query["$or"] = [
            {"phone": rx},
            {"name": rx},
            {"address": rx},
            {"village": rx},
            {"city": rx},
            {"district": rx},
            {"state": rx},
            {"pincode": rx},
        ]
    cursor = db.customers.find(query, {"_id": 0}).sort("updated_at", -1)
    customers = await cursor.to_list(1000)
    phones = [c["phone"] for c in customers]
    counts = {}
    if phones:
        pipeline = [
            {"$match": {"phone": {"$in": phones}}},
            {"$group": {"_id": "$phone", "n": {"$sum": 1}}},
        ]
        async for row in db.complaints.aggregate(pipeline):
            counts[row["_id"]] = row["n"]
    out = []
    for c in customers:
        cc = _customer_clean(c)
        cc["complaint_count"] = counts.get(cc["phone"], 0)
        out.append(cc)
    return out


@api_router.get("/customers/{phone}")
async def get_customer_with_history(phone: str, _: str = Depends(current_admin)):
    phone = phone.strip()
    cust = await db.customers.find_one({"phone": phone}, {"_id": 0})
    if not cust:
        # Try lazy-create from complaints
        complaint = await db.complaints.find_one({"phone": phone}, {"_id": 0}, sort=[("created_at", -1)])
        if not complaint:
            raise HTTPException(status_code=404, detail="Customer not found")
        now = now_iso()
        cust = {
            "phone": phone,
            "name": complaint.get("name", ""),
            "address": complaint.get("address", ""),
            "village": complaint.get("village", ""),
            "city": complaint.get("city", ""),
            "district": complaint.get("district", ""),
            "state": complaint.get("state", ""),
            "pincode": complaint.get("pincode", ""),
            "created_at": now,
            "updated_at": now,
        }
        await db.customers.update_one({"phone": phone}, {"$set": cust, "$setOnInsert": {"created_at": now}}, upsert=True)
    complaints = await db.complaints.find({"phone": phone}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return {"customer": _customer_clean(cust), "complaints": complaints}


@api_router.patch("/customers/{phone}")
async def update_customer(phone: str, body: CustomerPhoneChange, _: str = Depends(current_admin)):
    phone = phone.strip()
    existing = await db.customers.find_one({"phone": phone}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Customer not found")
    now = now_iso()
    update = {
        "name": body.name.strip(),
        "address": (body.address or "").strip(),
        "village": (body.village or "").strip(),
        "city": (body.city or "").strip(),
        "district": (body.district or "").strip(),
        "state": (body.state or "").strip(),
        "pincode": (body.pincode or "").strip(),
        "updated_at": now,
    }
    new_phone = (body.phone or "").strip()
    if new_phone and new_phone != phone:
        clash = await db.customers.find_one({"phone": new_phone}, {"_id": 0})
        if clash:
            raise HTTPException(status_code=400, detail="Another customer already uses that phone")
        update["phone"] = new_phone
        # Migrate complaints to new phone
        await db.complaints.update_many({"phone": phone}, {"$set": {"phone": new_phone, "updated_at": now}})
    await db.customers.update_one({"phone": phone}, {"$set": update})
    final_phone = new_phone if new_phone and new_phone != phone else phone
    refreshed = await db.customers.find_one({"phone": final_phone}, {"_id": 0})
    return _customer_clean(refreshed)


@api_router.delete("/customers/{phone}")
async def delete_customer(phone: str, cascade: bool = False, _: str = Depends(current_admin)):
    phone = phone.strip()
    res = await db.customers.delete_one({"phone": phone})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    deleted_complaints = 0
    if cascade:
        cr = await db.complaints.delete_many({"phone": phone})
        deleted_complaints = cr.deleted_count
    return {"ok": True, "deleted_complaints": deleted_complaints}


@api_router.get("/stats")
async def stats(_: str = Depends(current_admin)):
    total = await db.complaints.count_documents({})
    pending = await db.complaints.count_documents({"status": "Pending"})
    in_progress = await db.complaints.count_documents({"status": "In Progress"})
    resolved = await db.complaints.count_documents({"status": "Resolved"})
    return {
        "total": total,
        "pending": pending,
        "in_progress": in_progress,
        "resolved": resolved,
    }


# ---------- Photo endpoints ----------
@api_router.post("/complaints/{cid}/photos")
async def upload_photo(cid: str, file: UploadFile = File(...), _: str = Depends(current_admin)):
    doc = await db.complaints.find_one({"complaint_id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Complaint not found")
    existing = doc.get("photos", []) or []
    if len(existing) >= MAX_PHOTOS_PER_COMPLAINT:
        raise HTTPException(status_code=400, detail=f"Max {MAX_PHOTOS_PER_COMPLAINT} photos per complaint")
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_IMAGE_MIME:
        raise HTTPException(status_code=400, detail="Only JPG/PNG/WebP images allowed")
    data = await file.read()
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=400, detail="Image exceeds 5MB limit")
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}.get(content_type, "bin")
    photo_id = str(uuid.uuid4())
    path = f"{APP_NAME}/complaints/{cid}/{photo_id}.{ext}"
    result = storage_put(path, data, content_type)

    photo_record = {
        "id": photo_id,
        "storage_path": result["path"],
        "original_filename": file.filename or f"{photo_id}.{ext}",
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "uploaded_at": now_iso(),
    }
    await db.complaints.update_one(
        {"complaint_id": cid},
        {"$push": {"photos": photo_record}, "$set": {"updated_at": now_iso()}},
    )
    return photo_record


@api_router.delete("/complaints/{cid}/photos/{photo_id}")
async def delete_photo(cid: str, photo_id: str, _: str = Depends(current_admin)):
    doc = await db.complaints.find_one({"complaint_id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Complaint not found")
    photos = doc.get("photos", []) or []
    if not any(p["id"] == photo_id for p in photos):
        raise HTTPException(status_code=404, detail="Photo not found")
    await db.complaints.update_one(
        {"complaint_id": cid},
        {"$pull": {"photos": {"id": photo_id}}, "$set": {"updated_at": now_iso()}},
    )
    return {"ok": True}


@api_router.get("/complaints/{cid}/photos/{photo_id}")
async def get_photo_admin(cid: str, photo_id: str, _: str = Depends(current_admin)):
    return await _fetch_photo(cid, photo_id)


# Public photo (no auth) — used in public tracking page
@api_router.get("/track/{cid}/photos/{photo_id}")
async def get_photo_public(cid: str, photo_id: str):
    return await _fetch_photo(cid, photo_id)


async def _fetch_photo(cid: str, photo_id: str):
    doc = await db.complaints.find_one(
        {"complaint_id": cid, "photos.id": photo_id},
        {"_id": 0, "photos": 1},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Photo not found")
    photo = next((p for p in doc.get("photos", []) if p["id"] == photo_id), None)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    data, content_type = storage_get(photo["storage_path"])
    return Response(content=data, media_type=photo.get("content_type", content_type))


# Public tracking — limited fields, no auth
@api_router.get("/track/{cid}")
async def track(cid: str):
    doc = await db.complaints.find_one({"complaint_id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Complaint not found")
    # Strip storage_path from public view; expose only photo ids + filenames
    public_photos = [
        {"id": p["id"], "original_filename": p.get("original_filename"), "content_type": p.get("content_type")}
        for p in (doc.get("photos", []) or [])
    ]
    return {
        "complaint_id": doc["complaint_id"],
        "name": doc["name"],
        "phone_masked": ("*" * max(0, len(doc["phone"]) - 4)) + doc["phone"][-4:],
        "product_serial": doc["product_serial"],
        "invoice_number": doc.get("invoice_number", ""),
        "product_details": doc.get("product_details", ""),
        "issue_description": doc["issue_description"],
        "date": doc["date"],
        "status": doc["status"],
        "status_history": doc.get("status_history", []),
        "photos": public_photos,
        "created_at": doc["created_at"],
        "updated_at": doc["updated_at"],
        "brand": BRAND_NAME,
    }


@api_router.get("/config")
async def public_config():
    return {"brand": BRAND_NAME}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def seed_admin():
    existing = await db.admins.find_one({"email": ADMIN_EMAIL.lower()}, {"_id": 0})
    if not existing:
        await db.admins.insert_one({
            "email": ADMIN_EMAIL.lower(),
            "password_hash": hash_password(ADMIN_PASSWORD),
            "created_at": now_iso(),
        })
        logger.info(f"Seeded admin: {ADMIN_EMAIL}")
    else:
        logger.info(f"Admin already exists: {ADMIN_EMAIL}")
    # Initialize object storage
    try:
        init_storage()
    except Exception as e:
        logger.error(f"Storage init at startup failed: {e}")

    # Create indexes for performance
    try:
        await db.customers.create_index("phone", unique=True)
        await db.complaints.create_index("phone")
        await db.complaints.create_index("complaint_id", unique=True)
        await db.complaints.create_index([("created_at", -1)])
        logger.info("Indexes ensured")
    except Exception as e:
        logger.warning(f"Index creation: {e}")

    # Backfill: for every complaint phone without a customer record, create one
    try:
        existing_phones = set()
        async for c in db.customers.find({}, {"_id": 0, "phone": 1}):
            existing_phones.add(c["phone"])
        seen = set()
        backfilled = 0
        async for cp in db.complaints.find({}, {"_id": 0}).sort("created_at", -1):
            phone = (cp.get("phone") or "").strip()
            if not phone or phone in seen or phone in existing_phones:
                continue
            seen.add(phone)
            now = now_iso()
            await db.customers.update_one(
                {"phone": phone},
                {
                    "$set": {
                        "phone": phone,
                        "name": cp.get("name", ""),
                        "address": cp.get("address", ""),
                        "village": cp.get("village", ""),
                        "city": cp.get("city", ""),
                        "district": cp.get("district", ""),
                        "state": cp.get("state", ""),
                        "pincode": cp.get("pincode", ""),
                        "updated_at": cp.get("updated_at", now),
                    },
                    "$setOnInsert": {"created_at": cp.get("created_at", now)},
                },
                upsert=True,
            )
            backfilled += 1
        if backfilled:
            logger.info(f"Backfilled {backfilled} customer record(s) from existing complaints")
    except Exception as e:
        logger.warning(f"Customer backfill failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
