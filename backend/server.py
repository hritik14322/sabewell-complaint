from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
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

app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ---------- Models ----------
StatusType = Literal["Pending", "In Progress", "Resolved"]
ALLOWED_STATUSES = ("Pending", "In Progress", "Resolved")


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
    product_serial: str
    issue_description: str
    date: str  # ISO date string (YYYY-MM-DD)
    status: StatusType = "Pending"
    status_history: List[StatusHistoryEntry] = Field(default_factory=list)
    created_at: str
    updated_at: str


class ComplaintCreate(BaseModel):
    name: str
    address: str
    phone: str
    product_serial: str
    issue_description: str
    date: Optional[str] = None  # YYYY-MM-DD; defaults to today


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


def send_whatsapp(to_phone: str, body: str) -> bool:
    """Send a WhatsApp message via Twilio. Returns True on success, False if skipped/failed."""
    if not (TWILIO_SID and TWILIO_TOKEN and TWILIO_FROM):
        logger.info("Twilio creds not set; skipping WhatsApp send")
        return False
    try:
        from twilio.rest import Client as TwilioClient
        twilio_client = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
        # Ensure E.164 phone; prepend 'whatsapp:' if not present
        to = to_phone.strip()
        if not to.startswith("whatsapp:"):
            if not to.startswith("+"):
                to = "+" + to
            to = f"whatsapp:{to}"
        from_ = TWILIO_FROM if TWILIO_FROM.startswith("whatsapp:") else f"whatsapp:{TWILIO_FROM}"
        msg = twilio_client.messages.create(body=body, from_=from_, to=to)
        logger.info(f"WhatsApp sent: sid={msg.sid}")
        return True
    except Exception as e:
        logger.warning(f"WhatsApp send failed: {e}")
        return False


def build_tracking_url(complaint_id: str) -> str:
    base = PUBLIC_APP_URL.rstrip("/") if PUBLIC_APP_URL else ""
    return f"{base}/track/{complaint_id}"


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


@api_router.post("/complaints", response_model=Complaint)
async def create_complaint(body: ComplaintCreate, _: str = Depends(current_admin)):
    cid = await generate_complaint_id()
    today = body.date or datetime.now(timezone.utc).date().isoformat()
    now = now_iso()
    complaint = Complaint(
        complaint_id=cid,
        name=body.name.strip(),
        address=body.address.strip(),
        phone=body.phone.strip(),
        product_serial=body.product_serial.strip(),
        issue_description=body.issue_description.strip(),
        date=today,
        status="Pending",
        status_history=[StatusHistoryEntry(status="Pending", note="Complaint registered", at=now)],
        created_at=now,
        updated_at=now,
    )
    doc = complaint.model_dump()
    await db.complaints.insert_one(doc)

    # Notify customer
    track_url = build_tracking_url(cid)
    body_msg = (
        f"Hello {complaint.name}, your complaint has been registered with {BRAND_NAME}.\n"
        f"Complaint ID: {cid}\n"
        f"Status: Pending\n"
        f"Track here: {track_url}"
    )
    send_whatsapp(complaint.phone, body_msg)
    return complaint


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
        query["$or"] = [
            {"complaint_id": {"$regex": q, "$options": "i"}},
            {"name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
            {"product_serial": {"$regex": q, "$options": "i"}},
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


@api_router.patch("/complaints/{cid}/status", response_model=Complaint)
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
    send_whatsapp(doc["phone"], body_msg)
    return doc


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


# Public tracking — limited fields, no auth
@api_router.get("/track/{cid}")
async def track(cid: str):
    doc = await db.complaints.find_one({"complaint_id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return {
        "complaint_id": doc["complaint_id"],
        "name": doc["name"],
        "phone_masked": ("*" * max(0, len(doc["phone"]) - 4)) + doc["phone"][-4:],
        "product_serial": doc["product_serial"],
        "issue_description": doc["issue_description"],
        "date": doc["date"],
        "status": doc["status"],
        "status_history": doc.get("status_history", []),
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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
