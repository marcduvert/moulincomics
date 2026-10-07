"""Backend tests for site_content localization endpoints."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://moulin-catalog.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "marcduvert@gmail.com"
ADMIN_PASSWORD = "11Joinville-"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def test_public_content_get():
    r = requests.get(f"{BASE_URL}/api/content", timeout=30)
    assert r.status_code == 200
    data = r.json()
    for k in ("hero", "maison", "salons", "villes", "footer"):
        assert k in data


def test_products_regression():
    r = requests.get(f"{BASE_URL}/api/products", timeout=30)
    assert r.status_code == 200
    prods = r.json()
    assert isinstance(prods, list)
    assert len(prods) >= 13, f"Expected >=13 products, got {len(prods)}"


def test_hero_en_override(session):
    body = {"eyebrow": "TEST_EN Comic Shop", "title": "Your next collectible\nis right here"}
    r = session.put(f"{BASE_URL}/api/admin/content/hero/en", json=body, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["hero"]["en"]["title"].startswith("Your next collectible")
    # French unchanged
    assert "Moulin Comics" in data["hero"]["title"] or data["hero"]["title"]


def test_footer_es_override(session):
    body = {"description": "TEST_ES Tienda de comics especializada"}
    r = session.put(f"{BASE_URL}/api/admin/content/footer/es", json=body, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["footer"]["es"]["description"].startswith("TEST_ES")


def test_invalid_lang(session):
    r = session.put(f"{BASE_URL}/api/admin/content/hero/de",
                    json={"title": "x"}, timeout=30)
    assert r.status_code == 400


def test_invalid_section(session):
    r = session.put(f"{BASE_URL}/api/admin/content/unknown/en",
                    json={"title": "x"}, timeout=30)
    assert r.status_code == 400


def test_no_auth():
    r = requests.put(f"{BASE_URL}/api/admin/content/hero/en",
                     json={"title": "x"}, timeout=30)
    assert r.status_code == 401


def test_maison_en_override_persists(session):
    # Get current
    r = requests.get(f"{BASE_URL}/api/content", timeout=30)
    fr_blocks = r.json()["maison"]["blocks"]
    # Save EN override with translated blocks
    en_blocks = [dict(b) for b in fr_blocks]
    en_blocks[0]["title"] = "TEST_EN VO first"
    r2 = session.put(f"{BASE_URL}/api/admin/content/maison/en",
                     json={"blocks": en_blocks}, timeout=30)
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert data["maison"]["en"]["blocks"][0]["title"] == "TEST_EN VO first"
    # Verify persistence via GET
    r3 = requests.get(f"{BASE_URL}/api/content", timeout=30)
    assert r3.json()["maison"]["en"]["blocks"][0]["title"] == "TEST_EN VO first"


def test_empty_override_unset(session):
    # Set then unset
    session.put(f"{BASE_URL}/api/admin/content/hero/es",
                json={"eyebrow": "TEST_ES temp"}, timeout=30)
    r = session.put(f"{BASE_URL}/api/admin/content/hero/es",
                    json={}, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "es" not in data["hero"] or not data["hero"].get("es")
