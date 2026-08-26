"""Backend perf/payload tests for /shop optimizations.

Ensures:
- GET /api/products list payload excludes description/description_en/description_es.
- Required list keys present.
- GET /api/products/{id} still returns full description fields.
- Backend filters still work: category=VO, category=VF, series=..., q=...
"""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

EXCLUDED = {"description", "description_en", "description_es"}
REQUIRED_LIST_KEYS = {
    "id", "title", "series", "publisher", "issue", "category", "price",
    "stock", "condition", "cover_image", "year", "author", "created_at",
}


def _get_products(params=None):
    r = requests.get(f"{API}/products", params=params or {}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_list_products_payload_excludes_description_fields():
    products = _get_products()
    assert isinstance(products, list) and len(products) > 0, "catalog empty"
    for p in products:
        leaked = EXCLUDED & set(p.keys())
        assert not leaked, f"list product leaks fields {leaked}: id={p.get('id')}"


def test_list_products_payload_has_required_keys():
    products = _get_products()
    p = products[0]
    missing = REQUIRED_LIST_KEYS - set(p.keys())
    assert not missing, f"list product missing required keys: {missing}"


def test_detail_product_has_description_fields():
    products = _get_products()
    pid = products[0]["id"]
    r = requests.get(f"{API}/products/{pid}", timeout=30)
    assert r.status_code == 200, r.text
    detail = r.json()
    for k in EXCLUDED:
        assert k in detail, f"detail missing key {k}"


def test_filter_category_vo():
    items = _get_products({"category": "VO"})
    assert len(items) > 0, "no VO products (seed?)"
    assert all(p["category"] == "VO" for p in items)


def test_filter_category_vf():
    items = _get_products({"category": "VF"})
    assert len(items) > 0, "no VF products (seed?)"
    assert all(p["category"] == "VF" for p in items)


def test_filter_series():
    all_items = _get_products()
    series_vals = [p.get("series") for p in all_items if p.get("series")]
    assert series_vals, "no series in catalog"
    target = series_vals[0]
    items = _get_products({"series": target})
    assert len(items) > 0
    assert all((p.get("series") or "") == target for p in items)


def test_filter_search_q():
    all_items = _get_products()
    # pick a token from first product title
    token = (all_items[0].get("title") or "").split()[0]
    assert token, "cannot derive token"
    items = _get_products({"q": token})
    assert len(items) > 0
    tok_low = token.lower()
    for p in items:
        hay = f"{p.get('title','')} {p.get('series','')} {p.get('publisher','')}".lower()
        assert tok_low in hay, f"q filter mismatch on {p.get('id')}"
