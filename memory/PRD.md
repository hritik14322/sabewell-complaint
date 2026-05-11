# sabewell — Complaint Tracking + WhatsApp Notification System

## Original problem statement
Complaint Tracking + Customer Notification System with two actors:
- **Company Owner (Admin)** registers complaints with structured data (Date, Name, Address, Product Serial, Phone, auto-generated Complaint ID, Issue description) and updates status (Pending → In Progress → Resolved).
- **Buyer** gets WhatsApp updates and can track complaint progress via a public link without logging in.

## Architecture
- **Frontend**: React (CRA), shadcn/ui, Tailwind, Outfit + IBM Plex Sans, sonner toasts. Routes: `/`, `/login`, `/admin`, `/admin/new`, `/admin/c/:cid`, `/track`, `/track/:cid`.
- **Backend**: FastAPI + Motor (MongoDB). JWT auth via PyJWT + bcrypt. Twilio Python SDK for WhatsApp.
- **DB collections**: `admins`, `complaints`, `counters` (per-year sequence for `CMP-YYYY-NNNN`).
- **Auth**: Seeded admin on startup (`admin@company.com` / `Admin@123`).
- **WhatsApp**: Twilio creds optional; helper no-ops gracefully when blank.

## User personas
- **Admin / Company Owner** — logs in, registers complaints, updates statuses.
- **Buyer / Customer** — receives Complaint ID via WhatsApp; opens public tracking page.

## Core requirements (static)
- Auto-generated Complaint ID format `CMP-YYYY-NNNN` (atomic counter per year).
- Status flow strictly: Pending → In Progress → Resolved (no Closed/Cancelled per user).
- Public tracking with masked phone (last 4 visible).
- WhatsApp notification on complaint creation and every status change.

## What's been implemented (2026-02)
- Backend endpoints: `/api/auth/login`, `/api/auth/me`, `/api/complaints` (POST/GET), `/api/complaints/{cid}` (GET), `/api/complaints/{cid}/status` (PATCH), `/api/track/{cid}` (public), `/api/stats`, `/api/config`.
- Frontend: Landing, Login, Admin Dashboard (stats + search + status filter + table), New Complaint form, Complaint Detail with timeline + status update, Public Track lookup + Public Track page with stepper.
- Twilio WhatsApp helper with graceful skip when creds are blank.
- Test coverage: 100% backend pytest pass, 100% frontend flows verified.

## Prioritized backlog
### P0 / Remaining
- Plug in real Twilio credentials (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`) in `/app/backend/.env` and restart backend.

### P1
- Bulk export complaints to CSV.
- Email fallback when WhatsApp delivery fails.
- Pagination on complaint list (currently capped at 1000).

### P2
- Customer can reply via WhatsApp inbound webhook (Twilio incoming).
- Attach photos/videos to a complaint.
- Multi-admin user management with role-based access.
- Internal notes (admin-only, not sent to customer).

## Test credentials
- Admin email: `admin@company.com`
- Admin password: `Admin@123`
