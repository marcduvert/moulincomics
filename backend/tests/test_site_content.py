"""Tests for site_content editorial endpoints and catalog non-regression."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://moulin-catalog.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "marcduvert@gmail.com"
ADMIN_PASSWORD = "11Joinville-"

DEFAULT_HERO = {
    "eyebrow": "Comic Shop · VO & VF · Paris",
    "title": "Moulin Comics —\nVotre prochaine pièce\nde collection est ici",
    "description": "BD & Comics français et américains — éditions anciennes, collectors et pépites à redécouvrir.",
    "primary_text": "Explorer le stock", "primary_url": "/shop",
    "secondary_text": "Les Spider-Man", "secondary_url": "/shop?series=Spider-Man",
    "image": "",
}
DEFAULT_MAISON_BLOCKS = [
    {"n": "01", "title": "La VO d'abord", "text": "Comic shop spécialisé en version originale. Marvel, DC, indés — les titres qui définissent le médium, dans leur langue d'origine."},
    {"n": "02", "title": "Le fonds VF", "text": "Un large stock de mensuels : les bons vieux Strange, Nova et Titans de l'ère Lug & Semic. La nostalgie a une adresse."},
    {"n": "03", "title": "Sur les salons", "text": "On sillonne les conventions d'Europe avec une sélection triée sur le volet. Retrouvez-nous case après case."},
]
DEFAULT_SALONS = {
    "eyebrow": "Sur la route", "title": "RETROUVEZ-NOUS SUR LES SALONS D'EUROPE",
    "description": "De Paris à Bruxelles, d'Angoulême à Lucca — on déballe nos caisses partout en Europe. Une sélection différente à chaque étape.",
    "button_text": "Voir l'agenda", "button_url": "/conventions", "image": "",
}
DEFAULT_VILLES = ["Angoulême", "Comic Con Paris", "Lucca", "Bruxelles", "Lyon", "FIBD"]
DEFAULT_FOOTER = {
    "description": "Comic shop spécialisé en VO. Large stock de mensuels VF — Strange, Nova, Titans. De la case à la caisse depuis toujours.",
    "address": "Paris · France", "email": "bonjour@moulincomics.fr", "phone": "",
    "social": "", "links": [],
}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"no token in response: {r.json()}"
    return token


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def initial_product_count():
    r = requests.get(f"{API}/products", timeout=30)
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", data.get("products", []))
    return len(items), items


def test_01_public_get_content_no_auth():
    r = requests.get(f"{API}/content", timeout=30)
    assert r.status_code == 200
    data = r.json()
    for k in ("hero", "maison", "salons", "villes", "footer"):
        assert k in data, f"section {k} missing"
    hero = data["hero"]
    for f in ("eyebrow", "title", "description", "primary_text", "primary_url", "secondary_text", "secondary_url", "image"):
        assert f in hero, f"hero missing {f}"
    assert isinstance(data["maison"].get("blocks"), list) and len(data["maison"]["blocks"]) == 3
    for b in data["maison"]["blocks"]:
        assert set(("n", "title", "text")).issubset(b.keys())
    salons = data["salons"]
    for f in ("eyebrow", "title", "description", "button_text", "button_url", "image"):
        assert f in salons
    assert isinstance(data["villes"], list)
    footer = data["footer"]
    for f in ("description", "address", "email", "phone", "social", "links"):
        assert f in footer


def test_02_put_hero_requires_auth():
    r = requests.put(f"{API}/admin/content/hero", json=DEFAULT_HERO, timeout=30)
    assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"


def test_03_put_hero_update_and_persist(auth_headers):
    new_hero = dict(DEFAULT_HERO)
    new_hero["eyebrow"] = "TEST_EYEBROW_XYZ"
    new_hero["title"] = "TEST_TITLE_XYZ"
    r = requests.put(f"{API}/admin/content/hero", json=new_hero, headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
    merged = r.json()
    assert merged["hero"]["eyebrow"] == "TEST_EYEBROW_XYZ"
    assert merged["hero"]["title"] == "TEST_TITLE_XYZ"
    # persistence via public GET
    g = requests.get(f"{API}/content", timeout=30)
    assert g.status_code == 200
    assert g.json()["hero"]["eyebrow"] == "TEST_EYEBROW_XYZ"


def test_04_put_villes_array_body(auth_headers):
    payload = ["PARIS", "LYON", "NICE"]
    r = requests.put(f"{API}/admin/content/villes", json=payload, headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["villes"] == payload
    g = requests.get(f"{API}/content", timeout=30)
    assert g.json()["villes"] == payload


def test_05_put_maison(auth_headers):
    payload = {"blocks": [
        {"n": "A1", "title": "TEST_T1", "text": "TEST_TX1"},
        {"n": "A2", "title": "TEST_T2", "text": "TEST_TX2"},
        {"n": "A3", "title": "TEST_T3", "text": "TEST_TX3"},
    ]}
    r = requests.put(f"{API}/admin/content/maison", json=payload, headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["maison"]["blocks"][0]["title"] == "TEST_T1"


def test_06_put_salons(auth_headers):
    payload = dict(DEFAULT_SALONS)
    payload["title"] = "TEST_SALONS_TITLE"
    r = requests.put(f"{API}/admin/content/salons", json=payload, headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["salons"]["title"] == "TEST_SALONS_TITLE"


def test_07_put_footer(auth_headers):
    payload = dict(DEFAULT_FOOTER)
    payload["email"] = "test_restore@example.com"
    r = requests.put(f"{API}/admin/content/footer", json=payload, headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["footer"]["email"] == "test_restore@example.com"


def test_08_unknown_section_returns_400(auth_headers):
    r = requests.put(f"{API}/admin/content/xxx", json={"foo": "bar"}, headers=auth_headers, timeout=30)
    assert r.status_code == 400, f"got {r.status_code}: {r.text}"


def test_09_catalog_non_regression(initial_product_count):
    initial_count, initial_items = initial_product_count
    r = requests.get(f"{API}/products", timeout=30)
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", data.get("products", []))
    assert len(items) == initial_count, f"product count changed: {initial_count} -> {len(items)}"
    # GET by id
    if items:
        pid = items[0].get("id") or items[0].get("_id")
        if pid:
            r2 = requests.get(f"{API}/products/{pid}", timeout=30)
            assert r2.status_code == 200


def test_99_restore_defaults(auth_headers):
    """Restore all sections to their defaults."""
    payloads = {
        "hero": DEFAULT_HERO,
        "maison": {"blocks": DEFAULT_MAISON_BLOCKS},
        "salons": DEFAULT_SALONS,
        "villes": DEFAULT_VILLES,
        "footer": DEFAULT_FOOTER,
    }
    for section, body in payloads.items():
        r = requests.put(f"{API}/admin/content/{section}", json=body, headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"restore {section}: {r.text}"
    g = requests.get(f"{API}/content", timeout=30).json()
    assert g["hero"]["eyebrow"] == DEFAULT_HERO["eyebrow"]
    assert g["villes"] == DEFAULT_VILLES
    assert g["footer"]["email"] == DEFAULT_FOOTER["email"]
