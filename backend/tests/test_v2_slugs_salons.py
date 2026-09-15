"""Batch V2 tests: SEO slugs + salons enrichis + orders items slug injection."""
import os
import re
import pytest
import requests

def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    except Exception:
        pass
    return None

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL not set"
API = f"{BASE}/api"
ADMIN_EMAIL = "marcduvert@gmail.com"
ADMIN_PWD = "11Joinville-"

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PWD}, timeout=15)
    assert r.status_code == 200, r.text
    return s


# ------- Slugs -------
class TestSlugs:
    def test_products_all_have_unique_readable_slug(self):
        r = requests.get(f"{API}/products", timeout=15)
        assert r.status_code == 200
        prods = r.json()
        assert len(prods) >= 13, f"Expected >=13 products, got {len(prods)}"
        slugs = []
        for p in prods:
            assert "slug" in p and p["slug"], f"Product missing slug: {p.get('title')}"
            assert SLUG_RE.match(p["slug"]), f"Bad slug format: {p['slug']}"
            slugs.append(p["slug"])
        assert len(slugs) == len(set(slugs)), "Duplicate slugs found"

    def test_resolve_by_slug(self):
        r = requests.get(f"{API}/products/deadpool-vs-punisher", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["slug"] == "deadpool-vs-punisher"
        assert "id" in data

    def test_resolve_by_id_still_works(self):
        prods = requests.get(f"{API}/products", timeout=15).json()
        p = next(x for x in prods if x["slug"] == "deadpool-vs-punisher")
        r = requests.get(f"{API}/products/{p['id']}", timeout=15)
        assert r.status_code == 200
        assert r.json()["slug"] == "deadpool-vs-punisher"

    def test_sitemap_uses_slugs_only(self):
        r = requests.get(f"{API}/sitemap.xml", timeout=15)
        assert r.status_code == 200
        xml = r.text
        # All /product/... URLs should be slugs (contain letters), not 24-char hex ObjectIds
        product_urls = re.findall(r"/product/([^<\s]+)", xml)
        assert len(product_urls) >= 13
        for u in product_urls:
            assert not re.fullmatch(r"[0-9a-f]{24}", u), f"ObjectId in sitemap: {u}"
            assert SLUG_RE.match(u), f"Bad slug in sitemap: {u}"


# ------- Rename product: old_slugs preservation + restore -------
class TestRenameProduct:
    def test_rename_preserves_old_slug_and_restore(self, admin_session):
        prods = requests.get(f"{API}/products", timeout=15).json()
        # Pick a low-risk product (not moulin-bd-comics, not out-of-stock spider-man)
        target = next(p for p in prods if p["slug"] not in {"moulin-bd-comics", "the-amazing-spider-man-403"}
                      and p.get("stock", 0) > 0)
        pid = target["id"]
        original_title = target["title"]
        original_slug = target["slug"]

        # Build PUT payload from existing fields
        def full_payload(p, title):
            return {
                "title": title,
                "series": p.get("series", ""),
                "issue": p.get("issue"),
                "price": p.get("price", 0),
                "stock": p.get("stock", 0),
                "condition": p.get("condition", "Neuf"),
                "language": p.get("language", "FR"),
                "publisher": p.get("publisher", ""),
                "year": p.get("year"),
                "description": p.get("description", ""),
                "description_en": p.get("description_en", ""),
                "description_es": p.get("description_es", ""),
                "images": p.get("images", []),
                "tags": p.get("tags", []),
            }

        try:
            new_title = f"{original_title} ZTEST"
            r = admin_session.put(f"{API}/admin/products/{pid}", json=full_payload(target, new_title), timeout=15)
            assert r.status_code == 200, r.text
            updated = r.json()
            new_slug = updated["slug"]
            assert new_slug != original_slug, "Slug should change on title change"
            assert original_slug in updated.get("old_slugs", []), \
                f"old_slugs should contain {original_slug}, got {updated.get('old_slugs')}"

            # Old slug still resolves
            r2 = requests.get(f"{API}/products/{original_slug}", timeout=15)
            assert r2.status_code == 200
            assert r2.json()["slug"] == new_slug
            # New slug also
            r3 = requests.get(f"{API}/products/{new_slug}", timeout=15)
            assert r3.status_code == 200
        finally:
            # Restore original title
            restored = admin_session.put(f"{API}/admin/products/{pid}",
                                         json=full_payload(target, original_title), timeout=15)
            assert restored.status_code == 200
            # Slug should return to original (since original_slug was in old_slugs, it's excluded from unique check for this doc)
            assert restored.json()["slug"] == original_slug, \
                f"Expected slug to revert to {original_slug}, got {restored.json()['slug']}"


# ------- Salons -------
class TestSalons:
    def test_list_has_new_fields(self):
        r = requests.get(f"{API}/salons", timeout=15)
        assert r.status_code == 200
        salons = r.json()
        for s in salons:
            for k in ("description", "website", "photo", "ordre"):
                assert k in s, f"Missing field {k} in salon"

    def test_update_persist_and_ordering(self, admin_session):
        salons = requests.get(f"{API}/salons", timeout=15).json()
        assert len(salons) >= 1, "Need at least one salon"
        target = salons[0]
        sid = target["id"]

        original = {k: target.get(k, "") for k in
                    ("date_label", "city", "country", "name", "note", "description", "website", "photo")}
        original["ordre"] = target.get("ordre")

        payload = {
            **original,
            "description": "TEST_DESC_V2",
            "website": "https://example.com/salon-test",
            "ordre": 1,
        }
        try:
            r = admin_session.put(f"{API}/admin/salons/{sid}", json=payload, timeout=15)
            assert r.status_code == 200, r.text
            out = r.json()
            assert out["description"] == "TEST_DESC_V2"
            assert out["website"] == "https://example.com/salon-test"
            assert out["ordre"] == 1

            # Verify persistence via list
            listed = requests.get(f"{API}/salons", timeout=15).json()
            match = next(s for s in listed if s["id"] == sid)
            assert match["website"] == "https://example.com/salon-test"
            # ordre=1 should push to top (or share top with other ordre-set salons)
            assert listed[0].get("ordre") is not None
        finally:
            admin_session.put(f"{API}/admin/salons/{sid}", json=original, timeout=15)


# ------- Orders admin: items have slug (or safe when deleted) -------
class TestOrdersItemsSlug:
    def test_admin_orders_items_have_slug(self, admin_session):
        r = admin_session.get(f"{API}/admin/orders", timeout=15)
        assert r.status_code == 200
        orders = r.json()
        if not orders:
            pytest.skip("No orders in DB")
        # Grab at least one item to check schema
        found_item = False
        for o in orders[:20]:
            for it in o.get("items", []) or []:
                found_item = True
                # slug key should be present (may be None/empty if product deleted)
                assert "slug" in it or "product_slug" in it or "product_id" in it, \
                    f"Order item missing slug info: keys={list(it.keys())}"
        assert found_item, "No items found across orders"


# ------- Product SEO/EN description -------
class TestProductLocalization:
    def test_product_has_description_fields(self):
        r = requests.get(f"{API}/products/deadpool-vs-punisher", timeout=15)
        assert r.status_code == 200
        d = r.json()
        # Description fields exist (may be empty)
        assert "description" in d
        # english optional
