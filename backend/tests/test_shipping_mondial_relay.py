"""Tests V1 Mondial Relay & shipping methods & admin shipping ops."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://moulin-catalog.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "marcduvert@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "11Joinville-")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


# ---- /shipping/methods ----
class TestShippingMethods:
    def test_methods_shape_and_prices(self, api):
        r = api.get(f"{BASE_URL}/api/shipping/methods")
        assert r.status_code == 200
        data = r.json()
        methods = {m["id"]: m for m in data["methods"]}
        assert set(methods.keys()) == {"mondial_relay", "home_delivery"}
        assert methods["mondial_relay"]["price"] == 4.9
        assert methods["home_delivery"]["price"] == 7.9
        assert methods["mondial_relay"]["available"] is False
        assert methods["home_delivery"]["available"] is True
        assert methods["mondial_relay"]["requires_relay"] is True
        assert "FR" in methods["mondial_relay"]["countries"]


# ---- /mondial-relay/points ----
class TestMondialRelayPoints:
    def test_not_configured(self, api):
        r = api.get(f"{BASE_URL}/api/mondial-relay/points", params={"postal_code": "75011"})
        assert r.status_code == 503
        assert "MONDIAL_RELAY_NOT_CONFIGURED" in r.text

    def test_missing_param(self, api):
        # When MR not configured, 503 takes precedence over 400. Accept either.
        r = api.get(f"{BASE_URL}/api/mondial-relay/points")
        assert r.status_code in (400, 503)

    def test_invalid_postal(self, api):
        r = api.get(f"{BASE_URL}/api/mondial-relay/points", params={"postal_code": "75"})
        assert r.status_code in (400, 503)


# ---- /payments/checkout with shipping ----
class TestCheckoutShipping:
    def _get_product(self, api):
        r = api.get(f"{BASE_URL}/api/products")
        assert r.status_code == 200
        products = r.json()
        # pick a product with stock > 0
        for p in products:
            if p.get("stock", 0) > 0 and p.get("price"):
                return p
        pytest.skip("No product with stock available")

    def test_home_delivery_creates_session(self, api):
        p = self._get_product(api)
        payload = {
            "items": [{"product_id": p["id"], "quantity": 1}],
            "origin_url": BASE_URL,
            "success_url": f"{BASE_URL}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
            "cancel_url": f"{BASE_URL}/payment/cancel",
            "shipping_method": "home_delivery",
        }
        r = api.post(f"{BASE_URL}/api/payments/checkout", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "checkout_url" in data or "url" in data
        assert "session_id" in data
        expected_total = round(float(p["price"]) + 7.9, 2)
        # amount may be exposed as 'amount' or 'total'
        actual = data.get("amount") or data.get("total")
        if actual is not None:
            assert round(float(actual), 2) == expected_total

    def test_mondial_relay_503_when_not_configured(self, api):
        p = self._get_product(api)
        payload = {
            "items": [{"product_id": p["id"], "quantity": 1}],
            "origin_url": BASE_URL,
            "success_url": f"{BASE_URL}/payment/success",
            "cancel_url": f"{BASE_URL}/payment/cancel",
            "shipping_method": "mondial_relay",
        }
        r = api.post(f"{BASE_URL}/api/payments/checkout", json=payload)
        assert r.status_code == 503
        assert "MONDIAL_RELAY_NOT_CONFIGURED" in r.text

    def test_unknown_method_400(self, api):
        p = self._get_product(api)
        payload = {
            "items": [{"product_id": p["id"], "quantity": 1}],
            "origin_url": BASE_URL,
            "success_url": f"{BASE_URL}/payment/success",
            "cancel_url": f"{BASE_URL}/payment/cancel",
            "shipping_method": "banana",
        }
        r = api.post(f"{BASE_URL}/api/payments/checkout", json=payload)
        assert r.status_code == 400

    def test_legacy_no_shipping_method_works(self, api):
        p = self._get_product(api)
        payload = {
            "items": [{"product_id": p["id"], "quantity": 1}],
            "origin_url": BASE_URL,
            "success_url": f"{BASE_URL}/payment/success",
            "cancel_url": f"{BASE_URL}/payment/cancel",
        }
        r = api.post(f"{BASE_URL}/api/payments/checkout", json=payload)
        assert r.status_code == 200, r.text


# ---- Admin shipping endpoints ----
class TestAdminShipping:
    def test_mr_status_endpoint(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/mondial-relay/status")
        assert r.status_code == 200
        data = r.json()
        assert data["api1_configured"] is False
        assert data["api2_configured"] is False

    def test_update_shipping_requires_auth(self, api):
        r = api.put(f"{BASE_URL}/api/admin/orders/FAKE_SID/shipping",
                    json={"shipping_status": "preparee"})
        assert r.status_code in (401, 403)

    def test_update_shipping_invalid_status(self, admin_session):
        r = admin_session.put(f"{BASE_URL}/api/admin/orders/FAKE_SID/shipping",
                              json={"shipping_status": "not_a_status"})
        assert r.status_code == 400

    def test_update_shipping_not_found(self, admin_session):
        r = admin_session.put(f"{BASE_URL}/api/admin/orders/FAKE_SID_NOT_EXIST/shipping",
                              json={"shipping_status": "preparee"})
        assert r.status_code == 404

    def test_create_shipment_503(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/admin/orders/FAKE_SID/create-shipment")
        assert r.status_code == 503
        assert "MONDIAL_RELAY_NOT_CONFIGURED" in r.text


# ---- Admin tarif change persists in /shipping/methods ----
class TestShippingPriceConfig:
    def test_update_home_price_and_restore(self, admin_session, api):
        # get current content
        r = admin_session.get(f"{BASE_URL}/api/content")
        assert r.status_code == 200
        content = r.json()
        shipping = content.get("shipping") or {"mondial_relay_price": 4.9, "home_delivery_price": 7.9}

        # set 8.90
        new_cfg = dict(shipping); new_cfg["home_delivery_price"] = 8.9
        r = admin_session.put(f"{BASE_URL}/api/admin/content/shipping", json=new_cfg)
        assert r.status_code == 200, r.text

        # verify
        r = api.get(f"{BASE_URL}/api/shipping/methods")
        m = {x["id"]: x for x in r.json()["methods"]}
        assert m["home_delivery"]["price"] == 8.9

        # restore 7.90
        restore_cfg = dict(shipping); restore_cfg["home_delivery_price"] = 7.9
        r = admin_session.put(f"{BASE_URL}/api/admin/content/shipping", json=restore_cfg)
        assert r.status_code == 200

        r = api.get(f"{BASE_URL}/api/shipping/methods")
        m = {x["id"]: x for x in r.json()["methods"]}
        assert m["home_delivery"]["price"] == 7.9
