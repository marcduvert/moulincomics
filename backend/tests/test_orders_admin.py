"""Regression tests for admin orders + customer/shipping/billing payload."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://moulin-catalog.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "marcduvert@gmail.com"
ADMIN_PASSWORD = "11Joinville-"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    token = r.json().get("token")
    if token:
        s.headers["Authorization"] = f"Bearer {token}"
    return s


def test_products_intact(admin_session):
    r = requests.get(f"{BASE_URL}/api/products", timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 13, f"expected 13+ products, got {len(data)}"


def test_admin_orders_shape(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/orders", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    # find a paid order and confirm customer/billing/shipping keys accessible
    paid = [o for o in data if o.get("payment_status") == "paid"]
    print(f"Total orders: {len(data)}, paid: {len(paid)}")
    for o in paid[:5]:
        print(f" - {o.get('session_id')[-10:]} cust={bool(o.get('customer'))} ship={bool(o.get('shipping'))} bill={bool(o.get('billing'))} amt={o.get('amount')}")
        # required fields
        for k in ("session_id", "items", "amount", "payment_status", "fulfillment_status"):
            assert k in o, f"missing {k} in order"
    # at least the historical marc duvert order should exist paid with customer
    md = [o for o in paid if (o.get("customer") or {}).get("email", "").lower() == "marcduvert@hotmail.com"]
    print(f"Marc duvert paid orders: {len(md)}")


def test_update_order_status_roundtrip(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/orders", timeout=30)
    orders = r.json()
    if not orders:
        pytest.skip("no orders to test status update")
    sid = orders[0]["session_id"]
    original = orders[0].get("fulfillment_status", "a_traiter")
    # set to en_attente
    r = admin_session.put(f"{BASE_URL}/api/admin/orders/{sid}/status",
                          json={"fulfillment_status": "expediee"}, timeout=20)
    assert r.status_code == 200
    assert r.json()["fulfillment_status"] == "expediee"
    # verify via GET
    r2 = admin_session.get(f"{BASE_URL}/api/admin/orders", timeout=30)
    matched = [o for o in r2.json() if o["session_id"] == sid][0]
    assert matched["fulfillment_status"] == "expediee"
    # restore
    admin_session.put(f"{BASE_URL}/api/admin/orders/{sid}/status",
                      json={"fulfillment_status": original}, timeout=20)


def test_update_order_status_invalid(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/orders", timeout=30)
    orders = r.json()
    if not orders:
        pytest.skip("no orders")
    sid = orders[0]["session_id"]
    r = admin_session.put(f"{BASE_URL}/api/admin/orders/{sid}/status",
                          json={"fulfillment_status": "bogus"}, timeout=20)
    assert r.status_code == 400


def test_admin_orders_requires_auth():
    r = requests.get(f"{BASE_URL}/api/admin/orders", timeout=20)
    assert r.status_code == 401


def test_create_checkout_returns_url():
    # Get a product with stock
    products = requests.get(f"{BASE_URL}/api/products", timeout=20).json()
    prod = next((p for p in products if p.get("stock", 0) > 0), None)
    assert prod, "no product in stock"
    r = requests.post(f"{BASE_URL}/api/payments/checkout", json={
        "items": [{"product_id": prod["id"], "quantity": 1}],
        "origin_url": BASE_URL,
    }, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "checkout_url" in data and data["checkout_url"].startswith("https://checkout.stripe.com")
    assert "session_id" in data
    print(f"Checkout session: {data['session_id']}, url: {data['checkout_url'][:80]}...")
