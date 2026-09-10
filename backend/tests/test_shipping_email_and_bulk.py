"""Tests for the shipping email transition + bulk delete orders endpoint."""
import os
import requests
import pytest
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://moulin-bd-comics.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "marcduvert@gmail.com"
ADMIN_PASSWORD = "11Joinville-"
ALICE_SID = "cs_test_a1Y3s33juteMNFWAtJJUlyO5rb4LKNpUJxpjSnmzzz7PX5YhgtMjXfIcOU"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


@pytest.fixture(scope="module")
def mongo_col():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME].payment_transactions
    client.close()


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


# --- Shipping email on transition to expediee ---

def test_shipping_email_first_transition_sends(admin_session, mongo_col):
    order = mongo_col.find_one({"session_id": ALICE_SID})
    if not order:
        pytest.skip("Alice E2E order not in DB")
    # Reset: unset shipping_email_sent and put fulfillment back to en_attente
    mongo_col.update_one({"session_id": ALICE_SID},
                         {"$set": {"fulfillment_status": "en_attente"},
                          "$unset": {"shipping_email_sent": ""}})
    r = admin_session.put(f"{BASE_URL}/api/admin/orders/{ALICE_SID}/status",
                          json={"fulfillment_status": "expediee"}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["fulfillment_status"] == "expediee"
    assert data["email_sent"] is True, f"expected email_sent True, got {data}"
    # flag persisted
    doc = mongo_col.find_one({"session_id": ALICE_SID})
    assert doc.get("shipping_email_sent") is True


def test_shipping_email_second_transition_no_duplicate(admin_session, mongo_col):
    # currently order is expediee + flag set from previous test.
    # First reset status to en_attente but leave shipping_email_sent True.
    mongo_col.update_one({"session_id": ALICE_SID},
                         {"$set": {"fulfillment_status": "en_attente",
                                   "shipping_email_sent": True}})
    r = admin_session.put(f"{BASE_URL}/api/admin/orders/{ALICE_SID}/status",
                          json={"fulfillment_status": "expediee"}, timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert data["fulfillment_status"] == "expediee"
    assert data["email_sent"] is False, f"expected no duplicate email, got {data}"


def test_status_change_to_en_attente_no_email(admin_session, mongo_col):
    r = admin_session.put(f"{BASE_URL}/api/admin/orders/{ALICE_SID}/status",
                          json={"fulfillment_status": "en_attente"}, timeout=20)
    assert r.status_code == 200
    assert r.json()["email_sent"] is False


def test_status_change_to_livree_no_email(admin_session, mongo_col):
    # reset shipping_email_sent to simulate never-sent, transition livree
    mongo_col.update_one({"session_id": ALICE_SID},
                         {"$unset": {"shipping_email_sent": ""},
                          "$set": {"fulfillment_status": "en_attente"}})
    r = admin_session.put(f"{BASE_URL}/api/admin/orders/{ALICE_SID}/status",
                          json={"fulfillment_status": "livree"}, timeout=20)
    assert r.status_code == 200
    assert r.json()["email_sent"] is False
    doc = mongo_col.find_one({"session_id": ALICE_SID})
    assert not doc.get("shipping_email_sent")


# --- Bulk delete ---

def test_bulk_delete_empty_body_400(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/admin/orders/bulk-delete",
                           json={"session_ids": []}, timeout=20)
    assert r.status_code == 400


def test_bulk_delete_requires_auth():
    r = requests.post(f"{BASE_URL}/api/admin/orders/bulk-delete",
                      json={"session_ids": ["x"]}, timeout=20)
    assert r.status_code == 401


def test_bulk_delete_removes_sessions(admin_session, mongo_col):
    # Insert 2 dummy pending orders directly
    dummies = [
        {"session_id": "TEST_bulk_del_1", "amount": 1.0, "currency": "eur",
         "payment_status": "pending", "fulfillment_status": "en_attente",
         "items": [], "created_at": "2026-01-01T00:00:00+00:00"},
        {"session_id": "TEST_bulk_del_2", "amount": 2.0, "currency": "eur",
         "payment_status": "pending", "fulfillment_status": "en_attente",
         "items": [], "created_at": "2026-01-01T00:00:00+00:00"},
    ]
    mongo_col.insert_many(dummies)
    try:
        r = admin_session.post(f"{BASE_URL}/api/admin/orders/bulk-delete",
                               json={"session_ids": ["TEST_bulk_del_1", "TEST_bulk_del_2"]},
                               timeout=20)
        assert r.status_code == 200, r.text
        assert r.json().get("deleted") == 2
        # Verify gone via GET
        listing = admin_session.get(f"{BASE_URL}/api/admin/orders", timeout=30).json()
        sids = {o["session_id"] for o in listing}
        assert "TEST_bulk_del_1" not in sids
        assert "TEST_bulk_del_2" not in sids
    finally:
        mongo_col.delete_many({"session_id": {"$in": ["TEST_bulk_del_1", "TEST_bulk_del_2"]}})


# --- Non-regression ---

def test_products_intact():
    r = requests.get(f"{BASE_URL}/api/products", timeout=20)
    assert r.status_code == 200
    prods = r.json()
    assert len(prods) >= 13, f"expected 13+ products, got {len(prods)}"


def test_content_intact():
    r = requests.get(f"{BASE_URL}/api/content", timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, (dict, list))
