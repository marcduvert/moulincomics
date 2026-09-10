"""Tests for Import IA endpoints (bulk-create + session + sessions).

Validates bug fix: /api/admin/import/session no longer returns raw ObjectId,
so the chained bulk-create + session flow used by the frontend succeeds.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://moulin-bd-comics.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "marcduvert@gmail.com"
ADMIN_PASSWORD = "11Joinville-"

created_product_ids: list[str] = []


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_auth_required_bulk_create():
    r = requests.post(f"{BASE_URL}/api/admin/import/bulk-create", json={"items": []}, timeout=15)
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


def test_auth_required_session():
    r = requests.post(f"{BASE_URL}/api/admin/import/session", json={}, timeout=15)
    assert r.status_code in (401, 403)


def test_auth_required_sessions_list():
    r = requests.get(f"{BASE_URL}/api/admin/import/sessions", timeout=15)
    assert r.status_code in (401, 403)


def test_bulk_create_products(auth_headers):
    items = [
        {
            "title": "TEST_Comic Alpha",
            "author": "TEST Author",
            "series": "TEST_SeriesAlpha",
            "publisher": "TEST Publisher",
            "category": "VO",
            "price": 9.99,
            "stock": 3,
            "condition": "Bon état",
            "year": "2020",
            "issue": "1",
            "description": "desc fr",
            "description_en": "desc en",
            "description_es": "desc es",
            "cover_image": "https://example.com/cover1.jpg",
        },
        {
            "title": "TEST_Comic Beta",
            "author": "TEST Author 2",
            "series": "TEST_SeriesBeta",
            "publisher": "TEST Publisher",
            "category": "VF",
            "price": 12.5,
            "stock": 1,
            "condition": "Très bon état",
            "year": "2021",
            "issue": "2",
            "description": "desc fr 2",
            "description_en": "desc en 2",
            "description_es": "desc es 2",
            "cover_image": "https://example.com/cover2.jpg",
        },
    ]
    r = requests.post(f"{BASE_URL}/api/admin/import/bulk-create",
                      json={"items": items}, headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"bulk-create failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("created") == 2, f"Expected created=2, got {data}"

    # Now fetch products and verify presence + fields.
    # NOTE: the list endpoint intentionally omits descriptions (light payload),
    # so description fields are verified via the detail endpoint.
    pr = requests.get(f"{BASE_URL}/api/products", timeout=30)
    assert pr.status_code == 200
    products = pr.json()
    titles = {p.get("title"): p for p in products}
    for it in items:
        assert it["title"] in titles, f"Missing product {it['title']}"
        p = titles[it["title"]]
        assert p.get("cover_image") == it["cover_image"]
        assert "_id" not in p, "Raw ObjectId should not be exposed"
        dr = requests.get(f"{BASE_URL}/api/products/{p['id']}", timeout=30)
        assert dr.status_code == 200
        detail = dr.json()
        assert detail.get("description_en") == it["description_en"]
        assert detail.get("description_es") == it["description_es"]
        pid = p.get("id")
        assert pid and isinstance(pid, str)
        created_product_ids.append(pid)


def test_save_import_session_returns_clean_json(auth_headers):
    body = {"total_photos": 2, "analyzed": 2, "imported": 2, "errors": 0, "duplicates": 0}
    r = requests.post(f"{BASE_URL}/api/admin/import/session",
                      json=body, headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"session save failed: {r.status_code} {r.text}"
    data = r.json()
    assert isinstance(data.get("id"), str) and len(data["id"]) > 0
    assert isinstance(data.get("date"), str)
    for k, v in body.items():
        assert data.get(k) == v
    assert "_id" not in data


def test_chained_bulk_then_session(auth_headers):
    """Simulate frontend flow: bulk-create THEN session — both must return 200."""
    items = [{
        "title": "TEST_Chained Comic",
        "author": "TEST",
        "series": "TEST_ChainedSeries",
        "publisher": "TEST",
        "category": "VO",
        "price": 5.0,
        "stock": 1,
        "condition": "Bon état",
        "year": "2019",
        "issue": "10",
        "description": "d",
        "description_en": "d",
        "description_es": "d",
        "cover_image": "https://example.com/c.jpg",
    }]
    r1 = requests.post(f"{BASE_URL}/api/admin/import/bulk-create",
                       json={"items": items}, headers=auth_headers, timeout=30)
    assert r1.status_code == 200, f"bulk-create failed: {r1.text}"
    assert r1.json().get("created") == 1

    r2 = requests.post(f"{BASE_URL}/api/admin/import/session",
                       json={"total_photos": 1, "analyzed": 1, "imported": 1,
                             "errors": 0, "duplicates": 0},
                       headers=auth_headers, timeout=30)
    assert r2.status_code == 200, f"session failed: {r2.text}"
    assert isinstance(r2.json().get("id"), str)

    # Track created product for cleanup
    pr = requests.get(f"{BASE_URL}/api/products", timeout=30)
    for p in pr.json():
        if p.get("title") == "TEST_Chained Comic":
            created_product_ids.append(p["id"])
            break


def test_list_import_sessions(auth_headers):
    r = requests.get(f"{BASE_URL}/api/admin/import/sessions", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    for d in data:
        assert isinstance(d.get("id"), str)
        assert "_id" not in d


def test_zzz_cleanup_created_products(auth_headers):
    """Delete all products created during tests."""
    unique_ids = list(set(created_product_ids))
    print(f"\nCleaning up {len(unique_ids)} test products: {unique_ids}")
    failed = []
    for pid in unique_ids:
        r = requests.delete(f"{BASE_URL}/api/admin/products/{pid}", headers=auth_headers, timeout=30)
        if r.status_code not in (200, 204):
            failed.append((pid, r.status_code, r.text))
    assert not failed, f"Failed to delete: {failed}"
