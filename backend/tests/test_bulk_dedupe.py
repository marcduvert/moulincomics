"""Tests for admin bulk-delete and dedupe endpoints."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://moulin-catalog.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "marcduvert@gmail.com"
ADMIN_PASSWORD = "11Joinville-"

TAG = "TESTQA_"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def _create_product(headers, **overrides):
    payload = {
        "title": f"{TAG}Default",
        "author": "QA",
        "series": "",
        "publisher": "QA",
        "category": "VO",
        "price": 9.99,
        "stock": 1,
        "condition": "Très bon état",
        "year": "2026",
        "issue": "",
        "description": "qa test",
        "cover_image": "",
        "featured": False,
    }
    payload.update(overrides)
    r = requests.post(f"{API}/admin/products", json=payload, headers=headers, timeout=15)
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
    return r.json()


def _list_products():
    r = requests.get(f"{API}/products", timeout=15)
    assert r.status_code == 200
    return r.json()


def _list_testqa(headers):
    # Fetch all TESTQA_ products by scanning list (limit 500)
    return [p for p in _list_products() if (p.get("title", "") or "").startswith(TAG)
            or (p.get("series", "") or "").startswith(TAG)]


@pytest.fixture(scope="module")
def initial_count():
    return len(_list_products())


@pytest.fixture(scope="module", autouse=True)
def _cleanup_after_module(headers, initial_count):
    yield
    # Final cleanup - remove any leftover TESTQA_ items
    leftovers = _list_testqa(headers)
    if leftovers:
        ids = [p["id"] for p in leftovers]
        requests.post(f"{API}/admin/products/bulk-delete", json={"ids": ids}, headers=headers, timeout=15)
    final = len(_list_products())
    assert final == initial_count, f"Catalog count changed: initial={initial_count}, final={final}"


# ---------- AUTH ----------
class TestAuth:
    def test_bulk_delete_requires_auth(self):
        r = requests.post(f"{API}/admin/products/bulk-delete", json={"ids": []}, timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_dedupe_requires_auth(self):
        r = requests.post(f"{API}/admin/products/dedupe", json={}, timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


# ---------- BULK DELETE ----------
class TestBulkDelete:
    def test_bulk_delete_empty(self, headers):
        r = requests.post(f"{API}/admin/products/bulk-delete", json={"ids": []}, headers=headers, timeout=15)
        assert r.status_code == 200
        assert r.json() == {"deleted": 0}

    def test_bulk_delete_invalid_ids(self, headers):
        r = requests.post(f"{API}/admin/products/bulk-delete",
                          json={"ids": ["not-an-oid", "xxxxx", "1234"]}, headers=headers, timeout=15)
        assert r.status_code == 200
        assert r.json() == {"deleted": 0}

    def test_bulk_delete_selective(self, headers, initial_count):
        # Create 3 TESTQA_ products
        p1 = _create_product(headers, title=f"{TAG}BULK_A", price=1.0)
        p2 = _create_product(headers, title=f"{TAG}BULK_B", price=2.0)
        p3 = _create_product(headers, title=f"{TAG}BULK_C", price=3.0)
        try:
            # Delete only p1 and p2
            r = requests.post(f"{API}/admin/products/bulk-delete",
                              json={"ids": [p1["id"], p2["id"]]}, headers=headers, timeout=15)
            assert r.status_code == 200
            body = r.json()
            assert body.get("deleted") == 2, f"expected deleted=2, got {body}"

            all_ids = {p["id"] for p in _list_products()}
            assert p1["id"] not in all_ids
            assert p2["id"] not in all_ids
            assert p3["id"] in all_ids, "untargeted product was deleted!"
        finally:
            # Clean p3
            requests.delete(f"{API}/admin/products/{p3['id']}", headers=headers, timeout=15)


# ---------- DEDUPE ----------
class TestDedupe:
    def test_dedupe_by_series_issue_category(self, headers):
        # Create 3 duplicates (series+issue+category) and 1 unique
        d1 = _create_product(headers, title=f"{TAG}D1", series=f"{TAG}DEDUPE",
                             issue="99", category="VO", price=10.0)
        time.sleep(0.05)
        d2 = _create_product(headers, title=f"{TAG}D2", series=f"{TAG}DEDUPE",
                             issue="99", category="VO", price=11.0)
        time.sleep(0.05)
        d3 = _create_product(headers, title=f"{TAG}D3", series=f"{TAG}DEDUPE",
                             issue="99", category="VO", price=12.0)
        u1 = _create_product(headers, title=f"{TAG}UNIQ", series=f"{TAG}UNIQUE",
                             issue="1", category="VO", price=20.0)

        created_ids = {d1["id"], d2["id"], d3["id"], u1["id"]}

        try:
            r = requests.post(f"{API}/admin/products/dedupe", headers=headers, timeout=30)
            assert r.status_code == 200, r.text
            body = r.json()
            assert "deleted" in body and "groups" in body
            assert body["deleted"] >= 2, f"expected >=2 deleted, got {body}"

            products = _list_products()
            # There should be exactly 1 TESTQA_DEDUPE product left and 1 TESTQA_UNIQUE product
            dedupe_left = [p for p in products if (p.get("series") or "") == f"{TAG}DEDUPE"]
            unique_left = [p for p in products if (p.get("series") or "") == f"{TAG}UNIQUE"]
            assert len(dedupe_left) == 1, f"expected 1 dedupe survivor, got {len(dedupe_left)}"
            assert len(unique_left) == 1, f"expected 1 unique product, got {len(unique_left)}"

            # Oldest survives -> d1 should survive
            assert dedupe_left[0]["id"] == d1["id"], \
                f"oldest not kept; expected {d1['id']}, got {dedupe_left[0]['id']}"

            # Cleanup survivors
            surv_ids = [dedupe_left[0]["id"], unique_left[0]["id"]]
            requests.post(f"{API}/admin/products/bulk-delete",
                          json={"ids": surv_ids}, headers=headers, timeout=15)
        except Exception:
            # Best-effort cleanup
            requests.post(f"{API}/admin/products/bulk-delete",
                          json={"ids": list(created_ids)}, headers=headers, timeout=15)
            raise

    def test_dedupe_by_title_when_no_series_or_issue(self, headers):
        # No series or no issue -> group by title+category
        a = _create_product(headers, title=f"{TAG}TITLE_DUP", series="", issue="", category="VF", price=5.0)
        time.sleep(0.05)
        b = _create_product(headers, title=f"{TAG}TITLE_DUP", series="", issue="", category="VF", price=6.0)
        c = _create_product(headers, title=f"{TAG}TITLE_DUP", series="", issue="", category="VO", price=7.0)  # different cat -> not a dup

        created_ids = [a["id"], b["id"], c["id"]]
        try:
            r = requests.post(f"{API}/admin/products/dedupe", headers=headers, timeout=30)
            assert r.status_code == 200, r.text
            products = _list_products()
            title_dups = [p for p in products if p.get("title") == f"{TAG}TITLE_DUP"]
            # a survives (oldest of VF group), b removed, c survives (different category)
            surviving_ids = {p["id"] for p in title_dups}
            assert a["id"] in surviving_ids
            assert c["id"] in surviving_ids
            assert b["id"] not in surviving_ids
        finally:
            existing = {p["id"] for p in _list_products()}
            ids_to_del = [i for i in created_ids if i in existing]
            if ids_to_del:
                requests.post(f"{API}/admin/products/bulk-delete",
                              json={"ids": ids_to_del}, headers=headers, timeout=15)
