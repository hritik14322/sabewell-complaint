"""Backend tests for sabewell complaint tracker."""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://issue-pipeline.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@company.com"
ADMIN_PASSWORD = "Admin@123"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---- Auth ----
def test_login_success():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["token_type"] == "bearer"
    assert d["email"] == ADMIN_EMAIL
    assert isinstance(d["access_token"], str) and len(d["access_token"]) > 10


def test_login_wrong_password():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=15)
    assert r.status_code == 401


def test_me_requires_auth():
    r = requests.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 401


def test_me_with_auth(auth):
    r = requests.get(f"{API}/auth/me", headers=auth, timeout=15)
    assert r.status_code == 200
    assert r.json()["email"] == ADMIN_EMAIL


# ---- Complaints CRUD ----
@pytest.fixture(scope="session")
def created_complaint(auth):
    payload = {
        "name": "TEST_John Doe",
        "address": "123 Test Ln",
        "phone": "+15551234567",
        "product_serial": "SN-TEST-001",
        "issue_description": "Device not turning on",
    }
    r = requests.post(f"{API}/complaints", headers=auth, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def test_create_complaint(created_complaint):
    c = created_complaint
    assert re.match(r"^CMP-\d{4}-\d{4}$", c["complaint_id"]), c["complaint_id"]
    assert c["status"] == "Pending"
    assert len(c["status_history"]) == 1
    assert c["status_history"][0]["status"] == "Pending"
    assert c["name"] == "TEST_John Doe"


def test_get_complaint_persisted(auth, created_complaint):
    cid = created_complaint["complaint_id"]
    r = requests.get(f"{API}/complaints/{cid}", headers=auth, timeout=15)
    assert r.status_code == 200
    assert r.json()["complaint_id"] == cid


def test_list_complaints(auth, created_complaint):
    r = requests.get(f"{API}/complaints", headers=auth, timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    assert any(c["complaint_id"] == created_complaint["complaint_id"] for c in items)


def test_list_filter_status(auth):
    r = requests.get(f"{API}/complaints", headers=auth, params={"status_filter": "Pending"}, timeout=15)
    assert r.status_code == 200
    for c in r.json():
        assert c["status"] == "Pending"


def test_list_search_q(auth, created_complaint):
    r = requests.get(f"{API}/complaints", headers=auth, params={"q": "SN-TEST-001"}, timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert any(c["complaint_id"] == created_complaint["complaint_id"] for c in items)


def test_update_status_to_in_progress(auth, created_complaint):
    cid = created_complaint["complaint_id"]
    r = requests.patch(f"{API}/complaints/{cid}/status", headers=auth,
                       json={"status": "In Progress", "note": "Tech assigned"}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "In Progress"
    assert len(d["status_history"]) >= 2

    # verify persisted
    g = requests.get(f"{API}/complaints/{cid}", headers=auth, timeout=15)
    assert g.json()["status"] == "In Progress"


def test_update_status_unchanged_returns_400(auth, created_complaint):
    cid = created_complaint["complaint_id"]
    r = requests.patch(f"{API}/complaints/{cid}/status", headers=auth,
                       json={"status": "In Progress"}, timeout=15)
    assert r.status_code == 400


# ---- Public tracking ----
def test_public_track_no_auth(created_complaint):
    cid = created_complaint["complaint_id"]
    r = requests.get(f"{API}/track/{cid}", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["complaint_id"] == cid
    # masked phone: last 4 visible, prior asterisks
    assert d["phone_masked"].endswith("4567")
    assert d["phone_masked"].startswith("*")
    assert "phone" not in d  # raw phone should not leak


def test_public_track_not_found():
    r = requests.get(f"{API}/track/CMP-9999-9999", timeout=15)
    assert r.status_code == 404


# ---- Stats ----
def test_stats(auth):
    r = requests.get(f"{API}/stats", headers=auth, timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ("total", "pending", "in_progress", "resolved"):
        assert k in d and isinstance(d[k], int)
    assert d["total"] >= d["pending"] + d["in_progress"] + d["resolved"] - 0


def test_complaints_requires_auth():
    r = requests.get(f"{API}/complaints", timeout=15)
    assert r.status_code == 401
