require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { MongoClient, ReturnDocument } = require("mongodb");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const axios = require("axios");

// ─── Config ────────────────────────────────────────────────────────────────
const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME || "complaint_db";
const JWT_SECRET = process.env.JWT_SECRET || "changeme";
const JWT_ALGORITHM = process.env.JWT_ALGORITHM || "HS256";
const JWT_EXPIRE_HOURS = 24 * 7;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const BRAND_NAME = process.env.BRAND_NAME || "sabewell";
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || "";
const PORT = process.env.PORT || 8000;

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM || "";
const TWILIO_CONTENT_SID = process.env.TWILIO_CONTENT_SID || "";
const TWILIO_SMS_FROM = process.env.TWILIO_SMS_FROM || "";

const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || "";
const FAST2SMS_WHATSAPP_MESSAGE_ID = process.env.FAST2SMS_WHATSAPP_MESSAGE_ID || "";

const STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage";
const EMERGENT_KEY = process.env.EMERGENT_LLM_KEY || "";
const APP_NAME = process.env.APP_NAME || "sabewell";

const ALLOWED_STATUSES = ["Pending", "In Progress", "Resolved"];
const ALLOWED_WARRANTY = ["Warranted", "Unwarranted"];
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_PHOTOS_PER_COMPLAINT = 5;

// ─── MongoDB ────────────────────────────────────────────────────────────────
let db;
const mongoClient = new MongoClient(MONGO_URL);

async function connectDB() {
  await mongoClient.connect();
  db = mongoClient.db(DB_NAME);
  console.log("MongoDB connected");
}

// ─── App ────────────────────────────────────────────────────────────────────
const app = express();

const corsOrigins = (process.env.CORS_ORIGINS || "*").split(",").map((s) => s.trim());
app.use(
  cors({
    origin: corsOrigins.includes("*") ? "*" : corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["*"],
  })
);
app.use(express.json());

// multer: store in memory for upload to object storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES },
});

// ─── Helpers ────────────────────────────────────────────────────────────────
function nowIso() {
  return new Date().toISOString();
}

function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}

function verifyPassword(pw, hashed) {
  try {
    return bcrypt.compareSync(pw, hashed);
  } catch {
    return false;
  }
}

function createToken(email) {
  return jwt.sign({ sub: email }, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: `${JWT_EXPIRE_HOURS}h`,
  });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
}

// Auth middleware
function requireAuth(req, res, next) {
  const header = req.headers["authorization"] || "";
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ detail: "Not authenticated" });
  }
  try {
    const payload = verifyToken(header.slice(7));
    req.adminEmail = payload.sub;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ detail: "Token expired" });
    }
    return res.status(401).json({ detail: "Invalid token" });
  }
}

// Optional auth (doesn't block unauthenticated, just populates req.adminEmail)
function optionalAuth(req, res, next) {
  const header = req.headers["authorization"] || "";
  if (header.startsWith("Bearer ")) {
    try {
      const payload = verifyToken(header.slice(7));
      req.adminEmail = payload.sub;
    } catch {
      // ignore
    }
  }
  next();
}

function normalizePhone(raw) {
  if (!raw) return raw;
  let p = raw.trim().replace(/\s/g, "").replace(/-/g, "");
  if (p.startsWith("+")) return p;
  if (p.length === 10 && "6789".includes(p[0])) return `+91${p}`;
  if (p.length === 12 && p.startsWith("91")) return `+${p}`;
  if (p.length === 11 && p.startsWith("0") && "6789".includes(p[1])) return `+91${p.slice(1)}`;
  return `+${p}`;
}

function buildTrackingUrl(complaintId) {
  const base = PUBLIC_APP_URL.replace(/\/$/, "");
  return `${base}/track/${complaintId}`;
}

async function generateComplaintId() {
  const now = new Date();
  const counter = await db.collection("counters").findOneAndUpdate(
    { _id: "complaint_global" },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  const seq = counter.seq;
  return `${now.getMonth() + 1}${now.getFullYear()}${String(seq).padStart(4, "0")}`;
}

function customerClean(c) {
  const keys = ["phone", "name", "address", "village", "city", "district", "state", "pincode", "created_at", "updated_at"];
  const out = {};
  for (const k of keys) out[k] = c[k] || "";
  return out;
}

// ─── Object Storage ─────────────────────────────────────────────────────────
let _storageKey = null;

async function initStorage() {
  if (_storageKey) return _storageKey;
  if (!EMERGENT_KEY) {
    console.warn("EMERGENT_LLM_KEY not set; storage disabled");
    return null;
  }
  try {
    const resp = await axios.post(`${STORAGE_URL}/init`, { emergent_key: EMERGENT_KEY }, { timeout: 30000 });
    _storageKey = resp.data.storage_key;
    console.log("Object storage initialized");
    return _storageKey;
  } catch (e) {
    console.error("Storage init failed:", e.message);
    return null;
  }
}

async function storagePut(path, data, contentType) {
  let key = await initStorage();
  if (!key) throw Object.assign(new Error("Storage unavailable"), { statusCode: 503 });

  const doRequest = async (k) =>
    axios.put(`${STORAGE_URL}/objects/${path}`, data, {
      headers: { "X-Storage-Key": k, "Content-Type": contentType },
      timeout: 120000,
    });

  let resp;
  try {
    resp = await doRequest(key);
  } catch (err) {
    if (err.response && err.response.status === 403) {
      _storageKey = null;
      key = await initStorage();
      if (!key) throw Object.assign(new Error("Storage unavailable"), { statusCode: 503 });
      resp = await doRequest(key);
    } else {
      throw err;
    }
  }
  return resp.data;
}

async function storageGet(path) {
  let key = await initStorage();
  if (!key) throw Object.assign(new Error("Storage unavailable"), { statusCode: 503 });

  const doRequest = async (k) =>
    axios.get(`${STORAGE_URL}/objects/${path}`, {
      headers: { "X-Storage-Key": k },
      responseType: "arraybuffer",
      timeout: 60000,
    });

  let resp;
  try {
    resp = await doRequest(key);
  } catch (err) {
    if (err.response && err.response.status === 403) {
      _storageKey = null;
      key = await initStorage();
      if (!key) throw Object.assign(new Error("Storage unavailable"), { statusCode: 503 });
      resp = await doRequest(key);
    } else if (err.response && err.response.status === 404) {
      throw Object.assign(new Error("File not found"), { statusCode: 404 });
    } else {
      throw err;
    }
  }
  return { data: resp.data, contentType: resp.headers["content-type"] || "application/octet-stream" };
}

// ─── Messaging helpers ───────────────────────────────────────────────────────
async function sendWhatsapp(toPhone, body, contentVariables = null) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    console.info("Twilio creds not set; skipping WhatsApp send");
    return false;
  }
  try {
    const twilio = require("twilio")(TWILIO_SID, TWILIO_TOKEN);
    let to = toPhone.trim();
    if (!to.startsWith("whatsapp:")) {
      if (!to.startsWith("+")) to = "+" + to;
      to = `whatsapp:${to}`;
    }
    const from_ = TWILIO_FROM.startsWith("whatsapp:") ? TWILIO_FROM : `whatsapp:${TWILIO_FROM}`;
    let msg;
    if (TWILIO_CONTENT_SID && contentVariables) {
      msg = await twilio.messages.create({
        contentSid: TWILIO_CONTENT_SID,
        contentVariables: JSON.stringify(
          Object.fromEntries(Object.entries(contentVariables).map(([k, v]) => [String(k), String(v)]))
        ),
        from: from_,
        to,
      });
    } else {
      msg = await twilio.messages.create({ body, from: from_, to });
    }
    console.info(`WhatsApp sent: sid=${msg.sid} status=${msg.status}`);
    return true;
  } catch (e) {
    console.warn("WhatsApp send failed:", e.message);
    return false;
  }
}

async function sendSmsFast2sms(toPhone, body) {
  if (!FAST2SMS_API_KEY) return [false, "Fast2SMS not configured"];
  const normalized = normalizePhone(toPhone);
  let mobile;
  if (normalized.startsWith("+91") && normalized.length === 13) {
    mobile = normalized.slice(3);
  } else if (normalized.startsWith("+") && normalized.length > 4) {
    mobile = normalized.slice(1);
  } else {
    return [false, "Fast2SMS Quick route supports Indian numbers only"];
  }
  if (mobile.length !== 10 || !/^\d+$/.test(mobile)) {
    return [false, `Invalid Indian mobile: ${mobile}`];
  }
  try {
    const resp = await axios.get("https://www.fast2sms.com/dev/bulkV2", {
      params: {
        authorization: FAST2SMS_API_KEY,
        message: body,
        language: "english",
        route: "q",
        numbers: mobile,
      },
      timeout: 30000,
    });
    const data = resp.data;
    if (resp.status < 300 && data.return) {
      console.info(`Fast2SMS SMS sent to ${mobile}`);
      return [true, `SMS sent to ${mobile} (Fast2SMS)`];
    }
    const err = (data.message || String(resp.status)).toString().slice(0, 200);
    console.warn("Fast2SMS SMS failed:", err);
    return [false, err];
  } catch (e) {
    console.warn("Fast2SMS SMS error:", e.message);
    return [false, e.message.slice(0, 200)];
  }
}

async function sendWhatsappFast2sms(toPhone, variables) {
  if (!FAST2SMS_API_KEY || !FAST2SMS_WHATSAPP_MESSAGE_ID) {
    return [false, "Fast2SMS not configured"];
  }
  const normalized = normalizePhone(toPhone);
  let mobile = normalized;
  if (mobile.startsWith("+91") && mobile.length === 13) mobile = mobile.slice(3);
  else if (mobile.startsWith("+")) mobile = mobile.slice(1);
  try {
    const resp = await axios.post(
      "https://www.fast2sms.com/dev/whatsapp/send",
      {
        message_id: FAST2SMS_WHATSAPP_MESSAGE_ID,
        mobile_number: mobile,
        variable_values: variables.map(String),
      },
      {
        headers: {
          authorization: FAST2SMS_API_KEY,
          "content-type": "application/json",
        },
        timeout: 30000,
      }
    );
    const data = resp.data;
    if (resp.status < 300 && data.success) {
      console.info(`Fast2SMS WhatsApp sent to ${mobile}`);
      return [true, `WhatsApp sent to ${mobile}`];
    }
    const err = (data.message || String(resp.status)).toString().slice(0, 200);
    console.warn("Fast2SMS WhatsApp failed:", err);
    return [false, err];
  } catch (e) {
    console.warn("Fast2SMS WhatsApp error:", e.message);
    return [false, e.message.slice(0, 200)];
  }
}

async function sendSms(toPhone, body) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_SMS_FROM) {
    return [false, "SMS not configured"];
  }
  try {
    const twilio = require("twilio")(TWILIO_SID, TWILIO_TOKEN);
    const to = normalizePhone(toPhone);
    const msg = await twilio.messages.create({ body, from: TWILIO_SMS_FROM, to });
    console.info(`SMS sent: sid=${msg.sid} status=${msg.status} to=${to}`);
    return [true, `SMS sent to ${to}`];
  } catch (e) {
    const err = e.message || "";
    let short;
    if (err.toLowerCase().includes("unverified")) {
      short = "Recipient not verified on Twilio (trial account)";
    } else if (err.includes("Invalid") && err.includes("Phone Number")) {
      short = "Invalid phone number format";
    } else {
      short = err.split(":").pop().trim().slice(0, 200);
    }
    console.warn("SMS send failed:", err);
    return [false, short];
  }
}

// ─── Root health-check (Hostinger hits / to verify the app is alive) ──────────
app.get("/", (req, res) => {
  res.json({ service: `${BRAND_NAME} complaint tracker`, status: "ok" });
});

// ─── Routes ──────────────────────────────────────────────────────────────────
const router = express.Router();

// GET /api/
router.get("/", (req, res) => {
  res.json({ service: `${BRAND_NAME} complaint tracker`, status: "ok" });
});

// GET /api/ping
router.get("/ping", (req, res) => {
  res.json({ pong: true });
});

// POST /api/auth/login
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ detail: "Email and password required" });
    const admin = await db.collection("admins").findOne({ email: email.toLowerCase() }, { projection: { _id: 0 } });
    if (!admin || !verifyPassword(password, admin.password_hash)) {
      return res.status(401).json({ detail: "Invalid email or password" });
    }
    const token = createToken(admin.email);
    res.json({ access_token: token, token_type: "bearer", email: admin.email });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /api/auth/me
router.get("/auth/me", requireAuth, (req, res) => {
  res.json({ email: req.adminEmail });
});

// POST /api/complaints
router.post("/complaints", optionalAuth, async (req, res) => {
  try {
    const body = req.body;
    const cid = await generateComplaintId();
    const today = body.date || new Date().toISOString().slice(0, 10);
    const now = nowIso();
    const phone = normalizePhone((body.phone || "").trim());

    const complaint = {
      id: uuidv4(),
      complaint_id: cid,
      name: (body.name || "").trim(),
      address: (body.address || "").trim(),
      phone,
      village: (body.village || "").trim(),
      city: (body.city || "").trim(),
      district: (body.district || "").trim(),
      state: (body.state || "").trim(),
      pincode: (body.pincode || "").trim(),
      invoice_number: (body.invoice_number || "").trim(),
      product_details: (body.product_details || "").trim(),
      product_serial: (body.product_serial || "").trim(),
      issue_description: (body.issue_description || "").trim(),
      date: today,
      status: "Pending",
      warranty: body.warranty || "Warranted",
      status_history: [{ status: "Pending", note: "Complaint registered", at: now }],
      photos: [],
      created_at: now,
      updated_at: now,
    };

    await db.collection("complaints").insertOne({ ...complaint });

    // Upsert customer
    await db.collection("customers").updateOne(
      { phone },
      {
        $set: {
          phone,
          name: complaint.name,
          address: complaint.address,
          village: complaint.village,
          city: complaint.city,
          district: complaint.district,
          state: complaint.state,
          pincode: complaint.pincode,
          updated_at: now,
        },
        $setOnInsert: { created_at: now },
      },
      { upsert: true }
    );

    // Notify
    const trackUrl = buildTrackingUrl(cid);
    const bodyMsg =
      `Hello ${complaint.name}, your complaint has been registered with ${BRAND_NAME}.\n` +
      `Complaint ID: ${cid}\nStatus: Pending\nTrack here: ${trackUrl}`;

    let [smsOk, smsMsg] = await sendSmsFast2sms(phone, bodyMsg);
    if (!smsOk) {
      const [twOk, twMsg] = await sendSms(phone, bodyMsg);
      if (twOk) { smsOk = true; smsMsg = twMsg; }
      else smsMsg = `Fast2SMS: ${smsMsg} | Twilio: ${twMsg}`;
    }
    const [waOk, waMsg] = await sendWhatsappFast2sms(phone, [complaint.name, cid, "Pending", trackUrl]);

    const result = { ...complaint };
    delete result._id;
    result.sms_status = { ok: smsOk, message: smsMsg };
    result.whatsapp_status = { ok: waOk, message: waMsg };
    res.json(result);
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /api/complaints/check-serial/:serial
router.get("/complaints/check-serial/:serial", async (req, res) => {
  try {
    const serial = (req.params.serial || "").trim();
    if (!serial) return res.json({ exists: false });
    const escaped = serial.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const found = await db.collection("complaints").findOne({
      product_serial: { $regex: `^${escaped}$`, $options: "i" },
    });
    res.json({ exists: !!found });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /api/complaints
router.get("/complaints", requireAuth, async (req, res) => {
  try {
    const { status_filter, q } = req.query;
    const query = {};
    if (status_filter && ALLOWED_STATUSES.includes(status_filter)) query.status = status_filter;
    if (q) {
      const rx = { $regex: q, $options: "i" };
      query.$or = [
        { complaint_id: rx }, { name: rx }, { phone: rx }, { product_serial: rx },
        { invoice_number: rx }, { product_details: rx }, { issue_description: rx },
        { address: rx }, { village: rx }, { city: rx }, { district: rx },
        { state: rx }, { pincode: rx },
      ];
    }
    const items = await db.collection("complaints").find(query, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(1000).toArray();
    res.json(items);
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /api/complaints/:cid
router.get("/complaints/:cid", requireAuth, async (req, res) => {
  try {
    const doc = await db.collection("complaints").findOne({ complaint_id: req.params.cid }, { projection: { _id: 0 } });
    if (!doc) return res.status(404).json({ detail: "Complaint not found" });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// PATCH /api/complaints/:cid/status
router.patch("/complaints/:cid/status", requireAuth, async (req, res) => {
  try {
    const { cid } = req.params;
    const { status, note } = req.body;
    if (!ALLOWED_STATUSES.includes(status)) return res.status(400).json({ detail: "Invalid status" });
    const doc = await db.collection("complaints").findOne({ complaint_id: cid }, { projection: { _id: 0 } });
    if (!doc) return res.status(404).json({ detail: "Complaint not found" });
    if (doc.status === status) return res.status(400).json({ detail: "Status unchanged" });

    const now = nowIso();
    const newEntry = { status, note: note || "", at: now };
    await db.collection("complaints").updateOne(
      { complaint_id: cid },
      { $set: { status, updated_at: now }, $push: { status_history: newEntry } }
    );

    doc.status = status;
    doc.updated_at = now;
    doc.status_history.push(newEntry);

    const trackUrl = buildTrackingUrl(cid);
    const bodyMsg =
      `Hi ${doc.name}, update on your complaint with ${BRAND_NAME}.\n` +
      `Complaint ID: ${cid}\nNew status: ${status}\n` +
      (note ? `Note: ${note}\n` : "") +
      `Track here: ${trackUrl}`;

    let [smsOk, smsMsg] = await sendSmsFast2sms(doc.phone, bodyMsg);
    if (!smsOk) {
      const [twOk, twMsg] = await sendSms(doc.phone, bodyMsg);
      if (twOk) { smsOk = true; smsMsg = twMsg; }
      else smsMsg = `Fast2SMS: ${smsMsg} | Twilio: ${twMsg}`;
    }
    const [waOk, waMsg] = await sendWhatsappFast2sms(doc.phone, [doc.name, cid, status, trackUrl]);

    doc.sms_status = { ok: smsOk, message: smsMsg };
    doc.whatsapp_status = { ok: waOk, message: waMsg };
    res.json(doc);
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// DELETE /api/complaints/:cid
router.delete("/complaints/:cid", requireAuth, async (req, res) => {
  try {
    const { cid } = req.params;
    const doc = await db.collection("complaints").findOne({ complaint_id: cid }, { projection: { _id: 0, phone: 1 } });
    if (!doc) return res.status(404).json({ detail: "Complaint not found" });
    const phone = doc.phone || "";
    await db.collection("complaints").deleteOne({ complaint_id: cid });
    if (phone) {
      const remaining = await db.collection("complaints").countDocuments({ phone });
      if (remaining === 0) await db.collection("customers").deleteOne({ phone });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// PATCH /api/complaints/:cid/warranty
router.patch("/complaints/:cid/warranty", requireAuth, async (req, res) => {
  try {
    const { cid } = req.params;
    const { warranty } = req.body;
    if (!ALLOWED_WARRANTY.includes(warranty)) return res.status(400).json({ detail: "Invalid warranty value" });
    const doc = await db.collection("complaints").findOne({ complaint_id: cid }, { projection: { _id: 0 } });
    if (!doc) return res.status(404).json({ detail: "Complaint not found" });
    const now = nowIso();
    await db.collection("complaints").updateOne({ complaint_id: cid }, { $set: { warranty, updated_at: now } });
    doc.warranty = warranty;
    doc.updated_at = now;
    res.json(doc);
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// ─── Customer endpoints ──────────────────────────────────────────────────────

// GET /api/customers/by-phone/:phone
router.get("/customers/by-phone/:phone", requireAuth, async (req, res) => {
  try {
    const phone = normalizePhone(req.params.phone.trim());
    const cust = await db.collection("customers").findOne({ phone }, { projection: { _id: 0 } });
    if (cust) return res.json({ found: true, customer: customerClean(cust) });

    const complaint = await db.collection("complaints").findOne(
      { phone },
      { projection: { _id: 0 }, sort: { created_at: -1 } }
    );
    if (complaint) {
      const now = nowIso();
      const synth = {
        phone, name: complaint.name || "", address: complaint.address || "",
        village: complaint.village || "", city: complaint.city || "",
        district: complaint.district || "", state: complaint.state || "",
        pincode: complaint.pincode || "", created_at: now, updated_at: now,
      };
      await db.collection("customers").updateOne(
        { phone },
        { $set: synth, $setOnInsert: { created_at: now } },
        { upsert: true }
      );
      return res.json({ found: true, customer: synth, source: "historical" });
    }
    res.json({ found: false });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// POST /api/customers/_backfill
router.post("/customers/_backfill", requireAuth, async (req, res) => {
  try {
    const existingCusts = await db.collection("customers").find({}, { projection: { _id: 0, phone: 1 } }).toArray();
    const existingPhones = new Set(existingCusts.map((c) => c.phone));
    const seen = new Set();
    let backfilled = 0;
    const allComplaints = await db.collection("complaints").find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).toArray();
    for (const cp of allComplaints) {
      const phone = (cp.phone || "").trim();
      if (!phone || seen.has(phone) || existingPhones.has(phone)) continue;
      seen.add(phone);
      const now = nowIso();
      await db.collection("customers").updateOne(
        { phone },
        {
          $set: {
            phone, name: cp.name || "", address: cp.address || "",
            village: cp.village || "", city: cp.city || "",
            district: cp.district || "", state: cp.state || "",
            pincode: cp.pincode || "", updated_at: cp.updated_at || now,
          },
          $setOnInsert: { created_at: cp.created_at || now },
        },
        { upsert: true }
      );
      backfilled++;
    }
    res.json({ backfilled });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /api/customers
router.get("/customers", requireAuth, async (req, res) => {
  try {
    const { q } = req.query;

    // Lazy reconcile
    const existingCusts = await db.collection("customers").find({}, { projection: { _id: 0, phone: 1 } }).toArray();
    const existingPhones = new Set(existingCusts.map((c) => c.phone));
    const seen = new Set();
    const allComplaints = await db.collection("complaints").find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).toArray();
    for (const cp of allComplaints) {
      const phone = (cp.phone || "").trim();
      if (!phone || seen.has(phone) || existingPhones.has(phone)) continue;
      seen.add(phone);
      const now = nowIso();
      await db.collection("customers").updateOne(
        { phone },
        {
          $set: {
            phone, name: cp.name || "", address: cp.address || "",
            village: cp.village || "", city: cp.city || "",
            district: cp.district || "", state: cp.state || "",
            pincode: cp.pincode || "", updated_at: cp.updated_at || now,
          },
          $setOnInsert: { created_at: cp.created_at || now },
        },
        { upsert: true }
      );
    }

    // Prune customers with zero complaints
    const phonesWithComplaints = await db.collection("complaints").distinct("phone");
    await db.collection("customers").deleteMany({ phone: { $nin: phonesWithComplaints.filter(Boolean) } });

    const query = {};
    if (q) {
      const rx = { $regex: q, $options: "i" };
      query.$or = [
        { phone: rx }, { name: rx }, { address: rx },
        { village: rx }, { city: rx }, { district: rx }, { state: rx }, { pincode: rx },
      ];
    }

    const customers = await db.collection("customers").find(query, { projection: { _id: 0 } }).sort({ updated_at: -1 }).limit(1000).toArray();
    const phones = customers.map((c) => c.phone);
    const counts = {};
    if (phones.length) {
      const agg = await db.collection("complaints").aggregate([
        { $match: { phone: { $in: phones } } },
        { $group: { _id: "$phone", n: { $sum: 1 } } },
      ]).toArray();
      for (const row of agg) counts[row._id] = row.n;
    }

    const out = customers.map((c) => {
      const cc = customerClean(c);
      cc.complaint_count = counts[cc.phone] || 0;
      return cc;
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /api/customers/:phone
router.get("/customers/:phone", requireAuth, async (req, res) => {
  try {
    const phone = normalizePhone(req.params.phone.trim());
    let cust = await db.collection("customers").findOne({ phone }, { projection: { _id: 0 } });
    if (!cust) {
      const complaint = await db.collection("complaints").findOne(
        { phone },
        { projection: { _id: 0 }, sort: { created_at: -1 } }
      );
      if (!complaint) return res.status(404).json({ detail: "Customer not found" });
      const now = nowIso();
      cust = {
        phone, name: complaint.name || "", address: complaint.address || "",
        village: complaint.village || "", city: complaint.city || "",
        district: complaint.district || "", state: complaint.state || "",
        pincode: complaint.pincode || "", created_at: now, updated_at: now,
      };
      await db.collection("customers").updateOne(
        { phone },
        { $set: cust, $setOnInsert: { created_at: now } },
        { upsert: true }
      );
    }
    const complaints = await db.collection("complaints").find({ phone }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(1000).toArray();
    res.json({ customer: customerClean(cust), complaints });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// PATCH /api/customers/:phone
router.patch("/customers/:phone", requireAuth, async (req, res) => {
  try {
    const phone = normalizePhone(req.params.phone.trim());
    const body = req.body;
    const existing = await db.collection("customers").findOne({ phone }, { projection: { _id: 0 } });
    if (!existing) return res.status(404).json({ detail: "Customer not found" });

    const now = nowIso();
    const update = {
      name: (body.name || "").trim(),
      address: (body.address || "").trim(),
      village: (body.village || "").trim(),
      city: (body.city || "").trim(),
      district: (body.district || "").trim(),
      state: (body.state || "").trim(),
      pincode: (body.pincode || "").trim(),
      updated_at: now,
    };

    const newPhone = body.phone ? normalizePhone(body.phone.trim()) : "";
    if (newPhone && newPhone !== phone) {
      const clash = await db.collection("customers").findOne({ phone: newPhone });
      if (clash) return res.status(400).json({ detail: "Another customer already uses that phone" });
      update.phone = newPhone;
      await db.collection("complaints").updateMany({ phone }, { $set: { phone: newPhone, updated_at: now } });
    }

    await db.collection("customers").updateOne({ phone }, { $set: update });
    const finalPhone = newPhone && newPhone !== phone ? newPhone : phone;
    const refreshed = await db.collection("customers").findOne({ phone: finalPhone }, { projection: { _id: 0 } });
    res.json(customerClean(refreshed));
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// DELETE /api/customers/:phone
router.delete("/customers/:phone", requireAuth, async (req, res) => {
  try {
    const phone = normalizePhone(req.params.phone.trim());
    const cascade = req.query.cascade === "true";
    const result = await db.collection("customers").deleteOne({ phone });
    if (result.deletedCount === 0) return res.status(404).json({ detail: "Customer not found" });
    let deletedComplaints = 0;
    if (cascade) {
      const cr = await db.collection("complaints").deleteMany({ phone });
      deletedComplaints = cr.deletedCount;
    }
    res.json({ ok: true, deleted_complaints: deletedComplaints });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /api/stats
router.get("/stats", requireAuth, async (req, res) => {
  try {
    const [total, pending, inProgress, resolved] = await Promise.all([
      db.collection("complaints").countDocuments({}),
      db.collection("complaints").countDocuments({ status: "Pending" }),
      db.collection("complaints").countDocuments({ status: "In Progress" }),
      db.collection("complaints").countDocuments({ status: "Resolved" }),
    ]);
    res.json({ total, pending, in_progress: inProgress, resolved });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// ─── Photo endpoints ──────────────────────────────────────────────────────────

// POST /api/complaints/:cid/photos
router.post("/complaints/:cid/photos", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const { cid } = req.params;
    const doc = await db.collection("complaints").findOne({ complaint_id: cid }, { projection: { _id: 0 } });
    if (!doc) return res.status(404).json({ detail: "Complaint not found" });
    const existing = doc.photos || [];
    if (existing.length >= MAX_PHOTOS_PER_COMPLAINT) {
      return res.status(400).json({ detail: `Max ${MAX_PHOTOS_PER_COMPLAINT} photos per complaint` });
    }
    if (!req.file) return res.status(400).json({ detail: "No file uploaded" });
    const contentType = (req.file.mimetype || "").toLowerCase();
    if (!ALLOWED_IMAGE_MIME.has(contentType)) {
      return res.status(400).json({ detail: "Only JPG/PNG/WebP images allowed" });
    }
    if (req.file.size === 0) return res.status(400).json({ detail: "Empty file" });

    const extMap = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    const ext = extMap[contentType] || "bin";
    const photoId = uuidv4();
    const path = `${APP_NAME}/complaints/${cid}/${photoId}.${ext}`;
    const result = await storagePut(path, req.file.buffer, contentType);

    const photoRecord = {
      id: photoId,
      storage_path: result.path,
      original_filename: req.file.originalname || `${photoId}.${ext}`,
      content_type: contentType,
      size: result.size || req.file.size,
      uploaded_at: nowIso(),
    };

    await db.collection("complaints").updateOne(
      { complaint_id: cid },
      { $push: { photos: photoRecord }, $set: { updated_at: nowIso() } }
    );
    res.json(photoRecord);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ detail: e.message });
  }
});

// DELETE /api/complaints/:cid/photos/:photoId
router.delete("/complaints/:cid/photos/:photoId", requireAuth, async (req, res) => {
  try {
    const { cid, photoId } = req.params;
    const doc = await db.collection("complaints").findOne({ complaint_id: cid }, { projection: { _id: 0 } });
    if (!doc) return res.status(404).json({ detail: "Complaint not found" });
    const photos = doc.photos || [];
    if (!photos.some((p) => p.id === photoId)) return res.status(404).json({ detail: "Photo not found" });
    await db.collection("complaints").updateOne(
      { complaint_id: cid },
      { $pull: { photos: { id: photoId } }, $set: { updated_at: nowIso() } }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /api/complaints/:cid/photos/:photoId  (admin)
router.get("/complaints/:cid/photos/:photoId", requireAuth, async (req, res) => {
  await fetchPhoto(req, res);
});

// GET /api/track/:cid/photos/:photoId  (public)
router.get("/track/:cid/photos/:photoId", async (req, res) => {
  await fetchPhoto(req, res);
});

async function fetchPhoto(req, res) {
  try {
    const { cid, photoId } = req.params;
    const doc = await db.collection("complaints").findOne(
      { complaint_id: cid, "photos.id": photoId },
      { projection: { _id: 0, photos: 1 } }
    );
    if (!doc) return res.status(404).json({ detail: "Photo not found" });
    const photo = (doc.photos || []).find((p) => p.id === photoId);
    if (!photo) return res.status(404).json({ detail: "Photo not found" });
    const { data, contentType } = await storageGet(photo.storage_path);
    res.set("Content-Type", photo.content_type || contentType);
    res.send(Buffer.from(data));
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ detail: e.message });
  }
}

// GET /api/track/:cid  (public tracking)
router.get("/track/:cid", async (req, res) => {
  try {
    const doc = await db.collection("complaints").findOne(
      { complaint_id: req.params.cid },
      { projection: { _id: 0 } }
    );
    if (!doc) return res.status(404).json({ detail: "Complaint not found" });
    const publicPhotos = (doc.photos || []).map((p) => ({
      id: p.id,
      original_filename: p.original_filename,
      content_type: p.content_type,
    }));
    const phone = doc.phone || "";
    res.json({
      complaint_id: doc.complaint_id,
      name: doc.name,
      phone_masked: "*".repeat(Math.max(0, phone.length - 4)) + phone.slice(-4),
      product_serial: doc.product_serial,
      invoice_number: doc.invoice_number || "",
      product_details: doc.product_details || "",
      issue_description: doc.issue_description,
      date: doc.date,
      status: doc.status,
      status_history: doc.status_history || [],
      photos: publicPhotos,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      brand: BRAND_NAME,
    });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /api/config  (public)
router.get("/config", (req, res) => {
  res.json({ brand: BRAND_NAME });
});

app.use("/api", router);

// ─── Startup ────────────────────────────────────────────────────────────────
async function seedAdmin() {
  const col = db.collection("admins");
  // Remove stale admins
  await col.deleteMany({ email: { $ne: ADMIN_EMAIL.toLowerCase() } });
  const existing = await col.findOne({ email: ADMIN_EMAIL.toLowerCase() });
  if (!existing) {
    await col.insertOne({
      email: ADMIN_EMAIL.toLowerCase(),
      password_hash: hashPassword(ADMIN_PASSWORD),
      created_at: nowIso(),
    });
    console.log(`Seeded admin: ${ADMIN_EMAIL}`);
  } else {
    await col.updateOne(
      { email: ADMIN_EMAIL.toLowerCase() },
      { $set: { password_hash: hashPassword(ADMIN_PASSWORD) } }
    );
    console.log(`Admin password updated: ${ADMIN_EMAIL}`);
  }
}

async function ensureIndexes() {
  try {
    await db.collection("customers").createIndex({ phone: 1 }, { unique: true });
    await db.collection("complaints").createIndex({ phone: 1 });
    await db.collection("complaints").createIndex({ complaint_id: 1 }, { unique: true });
    await db.collection("complaints").createIndex({ created_at: -1 });
    console.log("Indexes ensured");
  } catch (e) {
    console.warn("Index creation:", e.message);
  }
}

async function backfillCustomers() {
  try {
    const existingCusts = await db.collection("customers").find({}, { projection: { _id: 0, phone: 1 } }).toArray();
    const existingPhones = new Set(existingCusts.map((c) => c.phone));
    const seen = new Set();
    let backfilled = 0;
    const allComplaints = await db.collection("complaints").find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).toArray();
    for (const cp of allComplaints) {
      const phone = (cp.phone || "").trim();
      if (!phone || seen.has(phone) || existingPhones.has(phone)) continue;
      seen.add(phone);
      const now = nowIso();
      await db.collection("customers").updateOne(
        { phone },
        {
          $set: {
            phone, name: cp.name || "", address: cp.address || "",
            village: cp.village || "", city: cp.city || "",
            district: cp.district || "", state: cp.state || "",
            pincode: cp.pincode || "", updated_at: cp.updated_at || now,
          },
          $setOnInsert: { created_at: cp.created_at || now },
        },
        { upsert: true }
      );
      backfilled++;
    }
    if (backfilled) console.log(`Backfilled ${backfilled} customer record(s)`);
  } catch (e) {
    console.warn("Customer backfill failed:", e.message);
  }
}

async function main() {
  await connectDB();
  await seedAdmin();
  await ensureIndexes();
  await backfillCustomers();
  try { await initStorage(); } catch (e) { console.error("Storage init at startup failed:", e.message); }

  // Mount API router
  app.use("/api", router);

  // Serve React frontend static build
  const frontendBuild = path.join(__dirname, "..", "frontend", "build");
  app.use(express.static(frontendBuild));

  // Catch-all: send index.html for all non-API routes (React Router)
  app.get("*", (req, res) => {
    res.sendFile(path.join(frontendBuild, "index.html"));
  });

  app.listen(PORT, () => {
    console.log(`Sabewell backend running on port ${PORT}`);
  });
}

main().catch((e) => {
  console.error("Startup error:", e);
  process.exit(1);
});

process.on("SIGTERM", async () => {
  await mongoClient.close();
  process.exit(0);
});
