from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Form, Body
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import logging
import uuid
import hashlib
import requests
from pydantic import BaseModel, Field, BeforeValidator, ConfigDict
from typing import List, Optional, Annotated, Any
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import bcrypt
import jwt
import stripe
import re
import ipaddress
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

# ---------- Email transactionnel (Resend managé Emergent) ----------
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
CONTACT_EMAIL = os.environ.get("CONTACT_EMAIL") or os.environ["ADMIN_EMAIL"]
import asyncio
import unicodedata
import zeep

# ---------- Slugs SEO produits ----------
def _slugify(title: str, issue=None) -> str:
    s = str(title or "")
    if issue and str(issue) not in s:
        s = f"{s} {issue}"
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s.lower()).strip("-")
    return s or "produit"

async def _unique_slug(base: str, exclude_id=None) -> str:
    slug, i = base, 2
    while True:
        q = {"$or": [{"slug": slug}, {"old_slugs": slug}]}
        if exclude_id:
            q["_id"] = {"$ne": exclude_id}
        if not await db.products.find_one(q):
            return slug
        slug = f"{base}-{i}"
        i += 1

async def _ensure_product_slugs():
    """Migration idempotente : attribue un slug unique aux produits qui n'en ont pas."""
    async for p in db.products.find({"slug": {"$exists": False}}):
        slug = await _unique_slug(_slugify(p.get("title"), p.get("issue")), exclude_id=p["_id"])
        await db.products.update_one({"_id": p["_id"]},
                                     {"$set": {"slug": slug}, "$setOnInsert": {}})

# ---------- Mondial Relay (API1 SOAP : recherche Points Relais) ----------
# Identifiants en variables d'environnement uniquement (jamais côté frontend).
# Valeurs actuelles = identifiants de test officiels Mondial Relay (développement) ;
# pour la production : remplacer par l'enseigne + clé privée du compte marchand.
MR_ENSEIGNE = os.environ.get("MONDIAL_RELAY_ENSEIGNE")
MR_PRIVATE_KEY = os.environ.get("MONDIAL_RELAY_PRIVATE_KEY")
MR_API1_WSDL = os.environ.get("MONDIAL_RELAY_API1_WSDL", "https://api.mondialrelay.fr/WebService.asmx?WSDL")
# API2 (expéditions/étiquettes) : nécessite le compte marchand Connect — non configuré en V1
MR_API2_LOGIN = os.environ.get("MONDIAL_RELAY_API2_LOGIN")
MR_API2_PASSWORD = os.environ.get("MONDIAL_RELAY_API2_PASSWORD")
MR_API2_CUSTOMER_ID = os.environ.get("MONDIAL_RELAY_API2_CUSTOMER_ID")

def mr_api1_configured() -> bool:
    return bool(MR_ENSEIGNE and MR_PRIVATE_KEY)

def mr_api2_configured() -> bool:
    return bool(MR_API2_LOGIN and MR_API2_PASSWORD and MR_API2_CUSTOMER_ID)

def _mr_hash(values: list) -> str:
    raw = "".join("" if v is None else str(v) for v in values) + MR_PRIVATE_KEY
    return hashlib.md5(raw.encode("utf-8")).hexdigest().upper()

def _fmt_hours(slots) -> str:
    try:
        vals = [str(s) for s in slots]
    except TypeError:
        return ""
    parts = []
    for i in range(0, len(vals) - 1, 2):
        o, c = vals[i], vals[i + 1]
        if o != "0000" and c != "0000":
            parts.append(f"{o[:2]}:{o[2:]}-{c[:2]}:{c[2:]}")
    return " / ".join(parts)

def _mr_search_points(country: str, postal_code: str, city: str) -> list:
    """WSI4_PointRelais_Recherche — synchrone (zeep), à appeler via asyncio.to_thread."""
    params = [MR_ENSEIGNE, country, "", city, postal_code, "", "", "", "", "24R",
              0, 20, "", "", 20]
    security = _mr_hash(params)
    client = zeep.Client(MR_API1_WSDL)
    resp = client.service.WSI4_PointRelais_Recherche(
        Enseigne=params[0], Pays=params[1], NumPointRelais=params[2], Ville=params[3],
        CP=params[4], Latitude=params[5], Longitude=params[6], Taille=params[7],
        Poids=params[8], Action=params[9], DelaiEnvoi=params[10],
        RayonRecherche=params[11], TypeActivite=params[12], NACE=params[13],
        NombreResultats=params[14], Security=security)
    stat = getattr(resp, "STAT", "99")
    if stat != "0":
        raise RuntimeError(f"Mondial Relay STAT={stat}")
    pr = getattr(resp, "PointsRelais", None)
    raw = getattr(pr, "PointRelais_Details", []) if pr else []
    if raw and not isinstance(raw, list):
        raw = [raw]
    out = []
    for p in raw or []:
        name = getattr(p, "LgAdr1", "") or ""
        type_act = getattr(p, "TypeActivite", "") or ""
        is_locker = "locker" in name.lower() or type_act == "APM"
        addr_lines = [getattr(p, f"LgAdr{i}", "") for i in (2, 3, 4)]
        address = ", ".join(a for a in addr_lines if a)
        days = [("monday", "Horaires_Lundi"), ("tuesday", "Horaires_Mardi"),
                ("wednesday", "Horaires_Mercredi"), ("thursday", "Horaires_Jeudi"),
                ("friday", "Horaires_Vendredi"), ("saturday", "Horaires_Samedi"),
                ("sunday", "Horaires_Dimanche")]
        hours = {d: _fmt_hours(getattr(p, f, [])) for d, f in days}
        hours = {d: h for d, h in hours.items() if h}
        dist = getattr(p, "Distance", "") or ""
        out.append({
            "id": getattr(p, "Num", ""), "name": name,
            "type": "Locker" if is_locker else "Point Relais",
            "address": address,
            "postal_code": getattr(p, "CP", "") or "", "city": getattr(p, "Ville", "") or "",
            "country": getattr(p, "Pays", "") or country,
            "latitude": getattr(p, "Latitude", "") or "",
            "longitude": getattr(p, "Longitude", "") or "",
            "distance_m": int(float(dist)) if str(dist).replace(".", "").isdigit() else None,
            "opening_hours": hours,
        })
    return out


_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)

def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)

def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)

class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []
    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []
    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)
    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []

def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")

async def send_email(*, to: str, subject: str, html: str, reply_to: str | None = None) -> str | None:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if reply_to or EMAIL_REPLY_TO:
        payload["contact_email"] = reply_to or EMAIL_REPLY_TO
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{EMAIL_BASE_URL}/api/v1/email/send",
            headers={"X-Email-Key": EMAIL_KEY},
            json=payload,
        )
    resp.raise_for_status()
    return resp.json().get("id")

def _order_email_html(order: dict, headline: str, message: str) -> str:
    name = escape((order.get("customer") or {}).get("name") or "")
    ref = escape(order.get("session_id", "")[-10:])
    rows = ""
    for i in order.get("items", []):
        title = escape(str(i.get("title", "")))
        qty = int(i.get("quantity", 1))
        line_total = f"{float(i.get('price', 0)) * qty:.2f} €"
        rows += ('<tr><td style="padding:6px 0;font-size:14px;border-bottom:1px solid #eee">'
                 + title + " ×" + str(qty)
                 + '</td><td style="padding:6px 0;font-size:14px;text-align:right;border-bottom:1px solid #eee">'
                 + line_total + "</td></tr>")
    ship = order.get("shipping") or order.get("billing") or {}
    a = ship.get("address") or {}
    city_line = " ".join(v for v in (a.get("postal_code"), a.get("city")) if v)
    addr_lines = [x for x in (ship.get("name"), a.get("line1"), a.get("line2"), city_line, a.get("country")) if x]
    addr = "<br>".join(escape(str(x)) for x in addr_lines) or "—"
    if order.get("shipping_method") == "mondial_relay" and order.get("relay_point_name"):
        relay_lines = [order.get("relay_point_name"), order.get("relay_point_address"),
                       " ".join(v for v in (order.get("relay_point_postal_code"), order.get("relay_point_city")) if v)]
        addr = ("<strong>Mondial Relay — " + escape(order.get("relay_point_type") or "Point Relais") + "</strong><br>"
                + "<br>".join(escape(str(x)) for x in relay_lines if x))
    elif order.get("shipping_method") == "home_delivery":
        addr = "<strong>Livraison à domicile</strong><br>" + addr
    total = f"{float(order.get('amount', 0)):.2f} €"
    brand = escape(EMAIL_FROM_NAME)
    return (
        '<table role="presentation" width="100%" style="background:#f5f2ea;padding:24px 0">'
        '<tr><td align="center"><table role="presentation" width="560" style="background:#ffffff;border:2px solid #141414;font-family:Arial,sans-serif;color:#141414">'
        '<tr><td style="background:#141414;color:#f5f2ea;padding:16px 24px;font-size:20px;font-weight:bold;letter-spacing:2px">'
        + brand + '</td></tr>'
        '<tr><td style="padding:24px">'
        '<p style="font-size:15px">Bonjour ' + name + ',</p>'
        '<p style="font-size:17px;font-weight:bold;margin:14px 0 4px">' + escape(headline) + '</p>'
        '<p style="font-size:15px">' + escape(message) + ' <strong>réf. ' + ref + '</strong></p>'
        '<p style="font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#c8102e;margin:20px 0 6px">Votre commande</p>'
        '<table role="presentation" width="100%">' + rows + ""
        '<tr><td style="padding:10px 0;font-size:15px;font-weight:bold">Total</td>'
        '<td style="padding:10px 0;font-size:15px;font-weight:bold;text-align:right">' + total + '</td></tr></table>'
        '<p style="font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#c8102e;margin:20px 0 6px">Livraison</p>'
        '<p style="font-size:14px;line-height:1.5">' + addr + '</p>'
        '<p style="font-size:13px;margin-top:20px">Merci pour votre confiance et bonne lecture !</p>'
        '</td></tr>'
        '<tr><td style="padding:14px 24px;font-size:11px;color:#888;border-top:1px solid #eee">'
        + brand + ' — nous ne vous demanderons jamais votre mot de passe ni vos coordonnées bancaires par email.'
        '</td></tr></table></td></tr></table>'
    )

def _shipping_email_html(order: dict) -> str:
    return _order_email_html(order, "Votre commande est expédiée",
                             "Bonne nouvelle : votre commande vient d'être expédiée.")

def _confirmation_email_html(order: dict) -> str:
    return _order_email_html(order, "Merci pour votre commande",
                             "Votre paiement est confirmé et votre commande est en préparation.")

async def _maybe_send_confirmation_email(session_id: str) -> bool:
    """Envoie l'email de confirmation si la commande est payée et pas encore notifiée."""
    order = await db.payment_transactions.find_one({"session_id": session_id})
    if not order or order.get("payment_status") != "paid" or order.get("confirmation_email_sent"):
        return False
    to = (order.get("customer") or {}).get("email")
    if not to:
        return False
    # Marquer avant l'envoi pour éviter tout doublon ; annuler si l'envoi échoue
    await db.payment_transactions.update_one(
        {"session_id": session_id}, {"$set": {"confirmation_email_sent": True}})
    try:
        await send_email(to=to,
                         subject="Confirmation de votre commande Moulin Comics",
                         html=_confirmation_email_html(order))
        return True
    except Exception:
        await db.payment_transactions.update_one(
            {"session_id": session_id}, {"$unset": {"confirmation_email_sent": ""}})
        raise

def _admin_order_email_html(order: dict) -> str:
    """Notification interne — récapitulatif simple d'une nouvelle commande payée."""
    ref = escape(order.get("session_id", "")[-10:])
    cust = order.get("customer") or {}
    name = escape(cust.get("name") or "—")
    email = escape(cust.get("email") or "—")
    total = f"{float(order.get('amount', 0)):.2f} €"
    rows = ""
    for i in order.get("items", []):
        rows += ('<tr><td style="padding:4px 0;font-size:14px;border-bottom:1px solid #eee">'
                 + str(int(i.get("quantity", 1))) + " × " + escape(str(i.get("title", "")))
                 + "</td></tr>")
    method = order.get("shipping_method")
    if method == "mondial_relay":
        cp_city = " ".join(v for v in (order.get("relay_point_postal_code"), order.get("relay_point_city")) if v)
        ship = ("<strong>Mondial Relay</strong><br>"
                "Point Relais : " + escape(order.get("relay_point_name") or "—") + "<br>"
                "Adresse : " + escape(order.get("relay_point_address") or "—") + "<br>"
                "CP / Ville : " + escape(cp_city or "—"))
    elif method == "home_delivery":
        sh = order.get("shipping") or order.get("billing") or {}
        a = sh.get("address") or {}
        city_line = " ".join(v for v in (a.get("postal_code"), a.get("city")) if v)
        addr_lines = [x for x in (sh.get("name"), a.get("line1"), a.get("line2"), city_line, a.get("country")) if x]
        ship = "<strong>Livraison à domicile</strong><br>" + ("<br>".join(escape(str(x)) for x in addr_lines) or "—")
    else:
        ship = "—"
    brand = escape(EMAIL_FROM_NAME)
    return (
        '<table role="presentation" width="100%" style="background:#f5f2ea;padding:24px 0">'
        '<tr><td align="center"><table role="presentation" width="560" style="background:#ffffff;border:2px solid #141414;font-family:Arial,sans-serif;color:#141414">'
        '<tr><td style="background:#141414;color:#f5f2ea;padding:16px 24px;font-size:18px;font-weight:bold;letter-spacing:2px">'
        + brand + ' — Nouvelle commande</td></tr>'
        '<tr><td style="padding:24px">'
        '<p style="font-size:15px">Nouvelle commande reçue sur Moulin Comics.</p>'
        '<p style="font-size:14px;margin:14px 0 2px"><strong>Commande :</strong> #' + ref + '</p>'
        '<p style="font-size:14px;margin:2px 0"><strong>Client :</strong> ' + name + '</p>'
        '<p style="font-size:14px;margin:2px 0"><strong>E-mail :</strong> ' + email + '</p>'
        '<p style="font-size:14px;margin:2px 0"><strong>Montant :</strong> ' + total + '</p>'
        '<p style="font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#c8102e;margin:20px 0 6px">Articles</p>'
        '<table role="presentation" width="100%">' + (rows or '<tr><td style="font-size:14px">—</td></tr>') + '</table>'
        '<p style="font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#c8102e;margin:20px 0 6px">Livraison</p>'
        '<p style="font-size:14px;line-height:1.5">' + ship + '</p>'
        '</td></tr></table></td></tr></table>'
    )

async def _maybe_send_admin_order_notification(session_id: str) -> bool:
    """Notification interne à CONTACT_EMAIL à la confirmation du paiement (une seule fois)."""
    order = await db.payment_transactions.find_one({"session_id": session_id})
    if not order or order.get("payment_status") != "paid" or order.get("admin_notification_sent"):
        return False
    # Pose atomique du drapeau avant envoi : évite tout doublon (webhook + polling, webhook répété)
    res = await db.payment_transactions.update_one(
        {"session_id": session_id, "admin_notification_sent": {"$ne": True}},
        {"$set": {"admin_notification_sent": True}})
    if res.modified_count != 1:
        return False
    try:
        await send_email(to=CONTACT_EMAIL.strip(),
                         subject=f"Nouvelle commande Moulin Comics — #{order.get('session_id','')[-10:]}"[:150],
                         html=_admin_order_email_html(order))
        return True
    except Exception:
        await db.payment_transactions.update_one(
            {"session_id": session_id}, {"$unset": {"admin_notification_sent": ""}})
        raise



# ---------- DB ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---------- Object storage ----------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "moulin-comics"
_storage_key = None

def init_storage(force: bool = False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type},
                            data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

MIME_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
              "gif": "image/gif", "webp": "image/webp"}
VIDEO_MIME_TYPES = {"mp4": "video/mp4", "webm": "video/webm", "mov": "video/quicktime", "m4v": "video/x-m4v"}

# ---------- Stripe ----------
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# ---------- Auth helpers ----------
JWT_ALGORITHM = "HS256"

def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(hours=12), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

async def get_current_admin(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Non authentifié")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token invalide")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user or user.get("role") != "admin":
            raise HTTPException(status_code=401, detail="Accès refusé")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expirée")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalide")

# ---------- Mongo base ----------
def _validate_object_id(v: Any) -> str:
    if isinstance(v, ObjectId):
        return str(v)
    return str(v)

PyObjectId = Annotated[str, BeforeValidator(_validate_object_id)]

# ---------- Models ----------
class Product(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    title: str
    author: Optional[str] = ""          # scénariste / dessinateur
    series: Optional[str] = ""          # Strange, Nova, Titans, or serie VO
    publisher: Optional[str] = ""       # Marvel, DC, Lug/Semic...
    category: str = "VO"                # "VO" or "VF"
    price: float
    stock: int = 1
    condition: str = "Très bon état"
    year: Optional[str] = ""
    issue: Optional[str] = ""           # numero
    description: Optional[str] = ""       # FR / défaut
    description_en: Optional[str] = ""
    description_es: Optional[str] = ""
    moulin_eye_type: Optional[str] = ""   # L'œil du Moulin — type (label stable)
    moulin_eye_text: Optional[str] = ""   # L'œil du Moulin — commentaire éditorial
    cover_image: str = ""
    featured: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @staticmethod
    def from_mongo(doc: dict) -> dict:
        doc = dict(doc)
        doc["id"] = str(doc.pop("_id"))
        return doc

class ProductCreate(BaseModel):
    title: str
    author: Optional[str] = ""
    series: Optional[str] = ""
    publisher: Optional[str] = ""
    category: str = "VO"
    price: float
    stock: int = 1
    condition: str = "Très bon état"
    year: Optional[str] = ""
    issue: Optional[str] = ""
    description: Optional[str] = ""
    description_en: Optional[str] = ""
    description_es: Optional[str] = ""
    moulin_eye_type: Optional[str] = ""
    moulin_eye_text: Optional[str] = ""
    cover_image: str = ""
    featured: bool = False

class LoginRequest(BaseModel):
    email: str
    password: str

class CartItem(BaseModel):
    product_id: str
    quantity: int = Field(1, ge=1, le=99)

class RelayPoint(BaseModel):
    id: str
    name: str
    type: str = ""
    address: str = ""
    postal_code: str
    city: str
    country: str = "FR"
    latitude: str = ""
    longitude: str = ""

class CheckoutRequest(BaseModel):
    items: List[CartItem]
    origin_url: str
    shipping_method: Optional[str] = None
    relay_point: Optional[RelayPoint] = None

# ---------- App ----------
app = FastAPI()
api = APIRouter(prefix="/api")

def serialize(doc: dict) -> dict:
    return Product.from_mongo(doc)

# ----- Public products -----
@api.get("/products")
async def list_products(category: Optional[str] = None, series: Optional[str] = None,
                        featured: Optional[bool] = None, q: Optional[str] = None):
    query: dict = {}
    if category:
        query["category"] = category
    if series:
        query["series"] = series
    if featured is not None:
        query["featured"] = featured
    if q:
        query["$or"] = [{"title": {"$regex": q, "$options": "i"}},
                        {"series": {"$regex": q, "$options": "i"}},
                        {"publisher": {"$regex": q, "$options": "i"}}]
    projection = {"description": 0, "description_en": 0, "description_es": 0}
    docs = await db.products.find(query, projection).sort("created_at", -1).to_list(5000)
    return [serialize(d) for d in docs]

@api.get("/products/{product_id}")
async def get_product(product_id: str):
    """Résout par identifiant interne, slug actuel ou ancien slug.
    La réponse indique toujours le slug canonique (champ slug)."""
    doc = None
    if ObjectId.is_valid(product_id):
        doc = await db.products.find_one({"_id": ObjectId(product_id)})
    if not doc:
        doc = await db.products.find_one({"$or": [{"slug": product_id}, {"old_slugs": product_id}]})
    if not doc:
        raise HTTPException(404, "Produit introuvable")
    return serialize(doc)

@api.get("/series")
async def list_series():
    docs = await db.series_list.find().sort("name", 1).to_list(500)
    return [d["name"] for d in docs]

# ----- Admin series CRUD -----
class SeriesBody(BaseModel):
    name: str

@api.get("/admin/series")
async def admin_list_series(admin: dict = Depends(get_current_admin)):
    docs = await db.series_list.find().sort("name", 1).to_list(500)
    out = []
    for d in docs:
        name = d["name"]
        count = await db.products.count_documents({"series": name})
        out.append({"id": str(d["_id"]), "name": name, "product_count": count})
    return out

@api.post("/admin/series")
async def admin_create_series(body: SeriesBody, admin: dict = Depends(get_current_admin)):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Nom requis")
    if await db.series_list.find_one({"name": name}):
        raise HTTPException(400, "Cette série existe déjà")
    res = await db.series_list.insert_one({"name": name, "created_at": datetime.now(timezone.utc).isoformat()})
    return {"id": str(res.inserted_id), "name": name, "product_count": 0}

@api.put("/admin/series/{series_id}")
async def admin_update_series(series_id: str, body: SeriesBody, admin: dict = Depends(get_current_admin)):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Nom requis")
    old = await db.series_list.find_one({"_id": ObjectId(series_id)})
    if not old:
        raise HTTPException(404, "Série introuvable")
    dup = await db.series_list.find_one({"name": name, "_id": {"$ne": ObjectId(series_id)}})
    if dup:
        raise HTTPException(400, "Cette série existe déjà")
    await db.series_list.update_one({"_id": ObjectId(series_id)}, {"$set": {"name": name}})
    await db.products.update_many({"series": old["name"]}, {"$set": {"series": name}})
    return {"id": series_id, "name": name}

@api.delete("/admin/series/{series_id}")
async def admin_delete_series(series_id: str, admin: dict = Depends(get_current_admin)):
    doc = await db.series_list.find_one({"_id": ObjectId(series_id)})
    if not doc:
        raise HTTPException(404, "Série introuvable")
    await db.series_list.delete_one({"_id": ObjectId(series_id)})
    await db.products.update_many({"series": doc["name"]}, {"$set": {"series": ""}})
    return {"ok": True}

# ----- Catégories produits (liste administrable, site_content.categories) -----
# L'ajout passe par l'endpoint générique PUT /admin/content/categories.
# Renommage et suppression migrent les produits associés (jamais supprimés).
@api.post("/admin/categories/rename")
async def rename_category(body: dict = Body(...), admin: dict = Depends(get_current_admin)):
    old = (body.get("old") or "").strip()
    new = (body.get("new") or "").strip()
    if not old or not new or old == new:
        raise HTTPException(400, "Noms invalides")
    doc = await db.site_content.find_one({"key": "home"}) or {}
    cats = doc.get("categories") or []
    if old not in cats:
        raise HTTPException(404, "Catégorie introuvable")
    cats = list(dict.fromkeys(new if c == old else c for c in cats))
    await db.site_content.update_one({"key": "home"}, {"$set": {"categories": cats}}, upsert=True)
    await db.products.update_many({"category": old}, {"$set": {"category": new}})
    return {"categories": cats}

@api.post("/admin/categories/delete")
async def delete_category(body: dict = Body(...), admin: dict = Depends(get_current_admin)):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Nom invalide")
    doc = await db.site_content.find_one({"key": "home"}) or {}
    cats = [c for c in (doc.get("categories") or []) if c != name]
    await db.site_content.update_one({"key": "home"}, {"$set": {"categories": cats}}, upsert=True)
    # Jamais de suppression de produits : ils passent simplement à « Sans catégorie ».
    await db.products.update_many({"category": name}, {"$set": {"category": ""}})
    return {"categories": cats}

# ----- Salons (conventions) -----
class SalonBody(BaseModel):
    date_label: str = ""
    city: str = ""
    country: str = ""
    name: str = ""
    note: str = ""
    description: str = ""
    website: str = ""
    photo: str = ""
    ordre: Optional[int] = None

def _salon_out(d: dict) -> dict:
    return {"id": str(d["_id"]), "date_label": d.get("date_label", ""), "city": d.get("city", ""),
            "country": d.get("country", ""), "name": d.get("name", ""), "note": d.get("note", ""),
            "description": d.get("description", ""), "website": d.get("website", ""),
            "photo": d.get("photo", ""), "ordre": d.get("ordre"),
            "created_at": d["created_at"].isoformat() if isinstance(d.get("created_at"), datetime) else d.get("created_at")}

@api.get("/salons")
async def list_salons():
    docs = await db.salons.find().to_list(500)
    # Tri : ordre explicite d'abord, sinon les plus récentes d'abord
    docs.sort(key=lambda d: (d.get("ordre") is None, d.get("ordre") or 0,
                             -(d["created_at"].timestamp() if isinstance(d.get("created_at"), datetime) else 0)))
    return [_salon_out(d) for d in docs]

@api.post("/admin/salons")
async def create_salon(body: SalonBody, admin: dict = Depends(get_current_admin)):
    doc = body.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.salons.insert_one(doc)
    return _salon_out(await db.salons.find_one({"_id": res.inserted_id}))

@api.put("/admin/salons/{salon_id}")
async def update_salon(salon_id: str, body: SalonBody, admin: dict = Depends(get_current_admin)):
    await db.salons.update_one({"_id": ObjectId(salon_id)}, {"$set": body.model_dump(exclude_unset=True)})
    doc = await db.salons.find_one({"_id": ObjectId(salon_id)})
    if not doc:
        raise HTTPException(404, "Salon introuvable")
    return _salon_out(doc)

@api.delete("/admin/salons/{salon_id}")
async def delete_salon(salon_id: str, admin: dict = Depends(get_current_admin)):
    await db.salons.delete_one({"_id": ObjectId(salon_id)})
    return {"ok": True}

# ----- Admin auth -----
@api.post("/auth/login")
async def login(body: LoginRequest, response: Response):
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Identifiants invalides")
    token = create_access_token(str(user["_id"]), email)
    response.set_cookie("access_token", token, httponly=True, secure=True,
                        samesite="none", max_age=43200, path="/")
    return {"email": email, "role": user.get("role", "admin"), "token": token}

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(admin: dict = Depends(get_current_admin)):
    return {"email": admin["email"], "role": admin.get("role")}

# ----- Admin product CRUD -----
@api.post("/admin/products")
async def create_product(body: ProductCreate, admin: dict = Depends(get_current_admin)):
    doc = Product(**body.model_dump()).model_dump(by_alias=True, exclude={"id"})
    doc["created_at"] = doc["created_at"].isoformat()
    doc["slug"] = await _unique_slug(_slugify(doc.get("title"), doc.get("issue")))
    res = await db.products.insert_one(doc)
    new = await db.products.find_one({"_id": res.inserted_id})
    return serialize(new)

@api.put("/admin/products/{product_id}")
async def update_product(product_id: str, body: ProductCreate, admin: dict = Depends(get_current_admin)):
    existing = await db.products.find_one({"_id": ObjectId(product_id)})
    if not existing:
        raise HTTPException(404, "Produit introuvable")
    updates = body.model_dump()
    # Slug : régénéré seulement si le titre/n° change ; l'ancien slug est conservé
    # dans old_slugs (redirection 301 côté frontend, jamais de chaîne).
    new_slug = _slugify(updates.get("title"), updates.get("issue"))
    cur_slug = existing.get("slug")
    if not cur_slug:
        updates["slug"] = await _unique_slug(new_slug, exclude_id=existing["_id"])
    elif new_slug != cur_slug:
        updates["slug"] = await _unique_slug(new_slug, exclude_id=existing["_id"])
        await db.products.update_one({"_id": existing["_id"]}, {"$addToSet": {"old_slugs": cur_slug}})
    await db.products.update_one({"_id": ObjectId(product_id)}, {"$set": updates})
    doc = await db.products.find_one({"_id": ObjectId(product_id)})
    return serialize(doc)

class ProductPatch(BaseModel):
    price: float | None = None
    series: str | None = None
    stock: int | None = None
    category: str | None = None

@api.patch("/admin/products/{product_id}")
async def patch_product(product_id: str, patch: ProductPatch, admin: dict = Depends(get_current_admin)):
    """Édition inline (table Stock admin) : mise à jour partielle prix/série/stock.
    N'écrase jamais les autres champs (contrairement au PUT complet)."""
    updates = {}
    if patch.price is not None:
        if patch.price < 0:
            raise HTTPException(400, "Le prix doit être supérieur ou égal à 0")
        updates["price"] = round(float(patch.price), 2)
    if patch.series is not None:
        updates["series"] = patch.series.strip()
    if patch.stock is not None:
        if patch.stock < 0:
            raise HTTPException(400, "Le stock doit être un entier supérieur ou égal à 0")
        updates["stock"] = int(patch.stock)
    if patch.category is not None:
        updates["category"] = patch.category.strip()
    if not updates:
        raise HTTPException(400, "Aucune modification")
    res = await db.products.update_one({"_id": ObjectId(product_id)}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Produit introuvable")
    return {"ok": True}

@api.delete("/admin/products/{product_id}")
async def delete_product(product_id: str, admin: dict = Depends(get_current_admin)):
    await db.products.delete_one({"_id": ObjectId(product_id)})
    return {"ok": True}

class BulkDeleteBody(BaseModel):
    ids: List[str]

@api.post("/admin/products/bulk-delete")
async def bulk_delete_products(body: BulkDeleteBody, admin: dict = Depends(get_current_admin)):
    oids = []
    for i in body.ids:
        try:
            oids.append(ObjectId(i))
        except Exception:
            pass
    if not oids:
        return {"deleted": 0}
    res = await db.products.delete_many({"_id": {"$in": oids}})
    return {"deleted": res.deleted_count}

@api.post("/admin/products/dedupe")
async def dedupe_products(admin: dict = Depends(get_current_admin)):
    docs = await db.products.find().sort("created_at", 1).to_list(5000)
    groups: dict = {}
    for d in docs:
        series = (d.get("series") or "").strip().lower()
        issue = (d.get("issue") or "").strip().lower()
        category = (d.get("category") or "").strip().upper()
        if series and issue:
            key = ("si", series, issue, category)
        else:
            title = (d.get("title") or "").strip().lower()
            if not title:
                continue
            key = ("t", title, category)
        groups.setdefault(key, []).append(d)
    to_delete = []
    for key, items in groups.items():
        if len(items) > 1:
            # keep the oldest (first, already sorted asc by created_at), delete the rest
            for extra in items[1:]:
                to_delete.append(extra["_id"])
    if not to_delete:
        return {"deleted": 0, "groups": 0}
    res = await db.products.delete_many({"_id": {"$in": to_delete}})
    return {"deleted": res.deleted_count, "groups": sum(1 for k, v in groups.items() if len(v) > 1)}

@api.post("/admin/upload")
async def upload_cover(file: UploadFile = File(...), admin: dict = Depends(get_current_admin)):
    ext = (file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin")
    if ext not in MIME_TYPES:
        raise HTTPException(400, "Format non supporté (jpg, png, gif, webp)")
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(400, "Image trop lourde (max 8 Mo)")
    path = f"{APP_NAME}/covers/{uuid.uuid4()}.{ext}"
    content_type = file.content_type or MIME_TYPES[ext]
    result = put_object(path, data, content_type)
    await db.files.insert_one({
        "storage_path": result["path"], "original_filename": file.filename,
        "content_type": content_type, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"path": result["path"], "url": f"/api/files/{result['path']}"}

@api.post("/admin/upload-video")
async def upload_video(file: UploadFile = File(...), admin: dict = Depends(get_current_admin)):
    ext = (file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin")
    if ext not in VIDEO_MIME_TYPES:
        raise HTTPException(400, "Format non supporté (mp4, webm, mov, m4v)")
    data = await file.read()
    if len(data) > 60 * 1024 * 1024:
        raise HTTPException(400, "Vidéo trop lourde (max 60 Mo)")
    path = f"{APP_NAME}/videos/{uuid.uuid4()}.{ext}"
    content_type = file.content_type or VIDEO_MIME_TYPES[ext]
    result = put_object(path, data, content_type)
    await db.files.insert_one({
        "storage_path": result["path"], "original_filename": file.filename,
        "content_type": content_type, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"path": result["path"], "url": f"/api/files/{result['path']}"}

@api.get("/files/{path:path}")
async def serve_file(path: str):
    record = await db.files.find_one({"storage_path": path})
    try:
        data, content_type = get_object(path)
    except Exception:
        raise HTTPException(404, "Fichier introuvable")
    ct = record.get("content_type", content_type) if record else content_type
    return Response(content=data, media_type=ct,
                    headers={"Cache-Control": "public, max-age=31536000"})

@api.post("/admin/analyze-cover")
async def analyze_cover(file: UploadFile = File(...), admin: dict = Depends(get_current_admin)):
    import base64, json as _json
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    ext = (file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin")
    if ext not in MIME_TYPES:
        raise HTTPException(400, "Format non supporté (jpg, png, gif, webp)")
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(400, "Image trop lourde (max 8 Mo)")
    content_type = file.content_type or MIME_TYPES[ext]
    # store cover
    path = f"{APP_NAME}/covers/{uuid.uuid4()}.{ext}"
    result = put_object(path, data, content_type)
    await db.files.insert_one({"storage_path": result["path"], "original_filename": file.filename,
                               "content_type": content_type, "created_at": datetime.now(timezone.utc).isoformat()})
    # analyze with vision LLM
    b64 = base64.b64encode(data).decode()
    system = ("Tu es un expert en bandes dessinées et comics pour le comic shop Moulin Comics "
              "(spécialiste VO US et mensuels VF Lug/Semic : Strange, Nova, Titans). "
              "À partir de la couverture fournie, identifie le comic et réponds STRICTEMENT en JSON valide, sans texte autour.")
    instructions = (
        "Analyse cette couverture de comic/BD et renvoie un objet JSON avec EXACTEMENT ces clés :\n"
        '{"title": str, "series": str, "author": str, "publisher": str, "issue": str, "year": str, '
        '"category": "VO" ou "VF", "condition": "", '
        '"description": str (français, 2 phrases, ton passionné de comic shop), '
        '"description_en": str (traduction anglaise), '
        '"description_es": str (traduction espagnole)}\n'
        "Règles: category = 'VO' si édition en version originale (anglais/US, ex. prix en cents/$), "
        "'VF' si édition française (Lug, Semic, prix en francs/euros, texte français). "
        "author = scénariste/dessinateur si visible sinon l'éditeur. "
        "Laisse une chaîne vide si une info est inconnue. Ne mets RIEN d'autre que le JSON."
    )
    try:
        chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=str(uuid.uuid4()),
                       system_message=system).with_model("openai", "gpt-5.4")
        raw = await chat.send_message(UserMessage(text=instructions, file_contents=[ImageContent(image_base64=b64)]))
    except Exception as e:
        logger.error(f"analyze-cover LLM error: {e}")
        raise HTTPException(502, "L'analyse IA a échoué. Réessayez ou remplissez manuellement.")
    text = raw if isinstance(raw, str) else str(raw)
    s, e = text.find("{"), text.rfind("}")
    fields = {}
    if s != -1 and e != -1:
        try:
            fields = _json.loads(text[s:e + 1])
        except Exception:
            fields = {}
    fields["cover_path"] = result["path"]
    fields["cover_url"] = f"/api/files/{result['path']}"
    return fields

# ===== IMPORT INTELLIGENT (batch) =====
def downscale_for_llm(data: bytes) -> bytes:
    """Copie temporaire réduite (max 1200 px sur le plus grand côté, ratio conservé)
    UNIQUEMENT pour l'envoi au modèle IA — l'image produit stockée conserve sa
    résolution/qualité d'origine. Renvoie data inchangé si déjà <= 1200 px."""
    import cv2
    import numpy as np
    try:
        arr = np.frombuffer(data, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return data
        h, w = img.shape[:2]
        m = max(h, w)
        if m <= 1200:
            return data
        scale = 1200.0 / m
        resized = cv2.resize(img, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, 90])
        return buf.tobytes() if ok else data
    except Exception:
        return data

def auto_crop_cover(data: bytes):
    """Détecte le plus grand quadrilatère (la couverture) et corrige la perspective.
    Renvoie (jpeg_bytes, 'jpg') si un recadrage fiable est trouvé, sinon (data, None)."""
    import cv2
    import numpy as np
    try:
        arr = np.frombuffer(data, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return data, None
        h, w = img.shape[:2]
        max_dim = 1400
        scale = min(1.0, max_dim / max(h, w))
        small = cv2.resize(img, (int(w * scale), int(h * scale))) if scale < 1 else img.copy()
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(gray, 50, 150)
        edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=2)
        cnts, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            return data, None
        area_img = small.shape[0] * small.shape[1]
        best = None
        for c in sorted(cnts, key=cv2.contourArea, reverse=True)[:5]:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            if len(approx) == 4 and cv2.contourArea(approx) > 0.20 * area_img:
                best = approx.reshape(4, 2).astype("float32")
                break
        if best is None:
            return data, None
        best /= scale  # back to full-res coords
        # order points: tl, tr, br, bl
        s = best.sum(axis=1); d = np.diff(best, axis=1)
        rect = np.array([best[np.argmin(s)], best[np.argmin(d)],
                         best[np.argmax(s)], best[np.argmax(d)]], dtype="float32")
        (tl, tr, br, bl) = rect
        wA = np.linalg.norm(br - bl); wB = np.linalg.norm(tr - tl)
        hA = np.linalg.norm(tr - br); hB = np.linalg.norm(tl - bl)
        mw, mh = int(max(wA, wB)), int(max(hA, hB))
        if mw < 200 or mh < 200:
            return data, None
        dst = np.array([[0, 0], [mw - 1, 0], [mw - 1, mh - 1], [0, mh - 1]], dtype="float32")
        M = cv2.getPerspectiveTransform(rect, dst)
        warped = cv2.warpPerspective(img, M, (mw, mh))
        ok, buf = cv2.imencode(".jpg", warped, [cv2.IMWRITE_JPEG_QUALITY, 90])
        if not ok:
            return data, None
        return buf.tobytes(), "jpg"
    except Exception:
        return data, None

def _analysis_prompt(with_desc: bool):
    system = ("Tu es un expert en comics et bandes dessinées pour le comic shop Moulin Comics "
              "(VO US et VF Lug/Semic : Strange, Nova, Titans, Batman, Spider-Man, X-Men, Superman, Hulk...). "
              "Tu analyses des couvertures. Tu n'inventes JAMAIS une information non lisible : "
              "dans ce cas tu renvoies la chaîne 'INCONNU' (ou 'À VÉRIFIER' pour la langue). "
              "Réponds STRICTEMENT en JSON valide sans texte autour.")
    keys = ('{"title": str, "series": str, "issue": str, "publisher": str, "author": str, '
            '"year": str, "language": "Français"|"Anglais"|"À vérifier", "country": str, '
            '"category": "VF"|"VO", "confidence": int, "series_uncertain": bool')
    if with_desc:
        keys += (', "description": str (français, 2 phrases, ton passionné de comic shop), '
                 '"description_en": str (anglais), "description_es": str (espagnol)')
    keys += "}"
    rules = (
        "Règles STRICTES:\n"
        "- title = titre complet visible (série + n° + sous-titre si présent).\n"
        "- series = NOM DE LA SÉRIE SEULE (ex: 'The Incredible Hulk #355 – Wildest Dreams' -> series='Hulk').\n"
        "- issue = numéro seul (ex '355'). Si absent -> 'INCONNU'.\n"
        "- category = 'VO' si édition version originale anglaise/US, 'VF' si édition française.\n"
        "- language: 'The Incredible Hulk' -> Anglais/VO ; 'Les aventures de' -> Français/VF. Si incertain -> 'À vérifier'.\n"
        "- N'invente NI l'année, NI le numéro, NI l'auteur, NI l'éditeur. Mets 'INCONNU' si non lisible.\n"
        "- confidence = certitude sur l'IDENTIFICATION (pas le prix), entier 0-100.\n"
        "- series_uncertain = true si le nom de série est incertain.\n")
    if with_desc:
        rules += "- description/description_en/description_es basées uniquement sur ce qui est identifiable.\n"
    rules += "Ne renvoie RIEN d'autre que le JSON."
    return system, ("Analyse cette couverture et renvoie un objet JSON avec EXACTEMENT ces clés :\n" + keys + "\n" + rules)

async def _analyze_with_model(b64: str, model: str, with_desc: bool) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    import json as _json
    system, instructions = _analysis_prompt(with_desc)
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=str(uuid.uuid4()),
                   system_message=system).with_model("openai", model)
    raw = await chat.send_message(UserMessage(text=instructions, file_contents=[ImageContent(image_base64=b64)]))
    text = raw if isinstance(raw, str) else str(raw)
    s, e = text.find("{"), text.rfind("}")
    if s != -1 and e != -1:
        try:
            return _json.loads(text[s:e + 1])
        except Exception:
            return {}
    return {}

CHEAP_MODEL = "gpt-5.4-mini"
STRONG_MODEL = "gpt-5.4"
ESCALATE_BELOW = 80

async def _find_duplicate(series: str, issue: str, category: str, publisher: str, year: str):
    if not series or series in ("INCONNU", "À VÉRIFIER") or not issue or issue == "INCONNU":
        return None
    query = {"series": {"$regex": f"^{series}$", "$options": "i"}, "issue": str(issue)}
    if category:
        query["category"] = category
    doc = await db.products.find_one(query)
    if doc:
        return {"id": str(doc["_id"]), "title": doc.get("title", "")}
    return None

@api.post("/admin/import/analyze")
async def import_analyze(file: UploadFile = File(...),
                         autocrop: bool = Form(True), economic: bool = Form(True),
                         with_desc: bool = Form(True),
                         admin: dict = Depends(get_current_admin)):
    import base64
    ext = (file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin")
    if ext not in MIME_TYPES:
        raise HTTPException(400, "Format non supporté (jpg, jpeg, png, webp)")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "Image trop lourde (max 10 Mo)")
    content_type = file.content_type or MIME_TYPES[ext]
    digest = hashlib.sha256(data).hexdigest()

    cached = await db.analysis_cache.find_one({"hash": digest})
    if cached:
        res = dict(cached["result"])
        res["cached"] = True
        res["hash"] = digest
        res["filename"] = file.filename
        res["duplicate"] = await _find_duplicate(res.get("series", ""), res.get("issue", ""),
                                                  res.get("category", ""), res.get("publisher", ""), res.get("year", ""))
        return res

    # optional auto-crop / deskew of the cover
    store_bytes, store_ext, store_ct = data, ext, content_type
    if autocrop:
        cropped, new_ext = auto_crop_cover(data)
        if new_ext:
            store_bytes, store_ext, store_ct = cropped, new_ext, MIME_TYPES[new_ext]

    # store image once (the cropped version becomes the cover)
    path = f"{APP_NAME}/covers/{uuid.uuid4()}.{store_ext}"
    stored = put_object(path, store_bytes, store_ct)
    await db.files.insert_one({"storage_path": stored["path"], "original_filename": file.filename,
                               "content_type": store_ct, "created_at": datetime.now(timezone.utc).isoformat()})
    # copie réduite (<=1200 px) envoyée à l'IA pour limiter le coût — l'original stocké
    # garde sa résolution ; le hash du cache (ci-dessus) reste calculé sur l'original.
    b64 = base64.b64encode(downscale_for_llm(store_bytes)).decode()
    try:
        if economic:
            model_used = CHEAP_MODEL
            fields = await _analyze_with_model(b64, CHEAP_MODEL, with_desc)
            conf = int(fields.get("confidence", 0)) if str(fields.get("confidence", "")).isdigit() else 0
            if conf < ESCALATE_BELOW:
                model_used = STRONG_MODEL
                fields = await _analyze_with_model(b64, STRONG_MODEL, with_desc)
        else:
            model_used = STRONG_MODEL
            fields = await _analyze_with_model(b64, STRONG_MODEL, with_desc)
    except Exception as ex:
        logger.error(f"import analyze LLM error: {ex}")
        raise HTTPException(502, "Analyse IA échouée")

    result = {
        "title": fields.get("title", ""), "series": fields.get("series", ""),
        "issue": fields.get("issue", ""), "publisher": fields.get("publisher", ""),
        "author": fields.get("author", ""), "year": fields.get("year", ""),
        "language": fields.get("language", "À vérifier"),
        "country": fields.get("country", ""),
        "category": "VF" if fields.get("category") == "VF" else "VO",
        "confidence": int(fields.get("confidence", 0)) if str(fields.get("confidence", "")).isdigit() else 0,
        "series_uncertain": bool(fields.get("series_uncertain", False)),
        "description": fields.get("description", ""),
        "description_en": fields.get("description_en", ""),
        "description_es": fields.get("description_es", ""),
        "cropped": bool(store_ext != ext or autocrop and store_bytes is not data),
        "model_used": model_used,
        "cover_path": stored["path"], "cover_url": f"/api/files/{stored['path']}",
    }
    await db.analysis_cache.insert_one({"hash": digest, "result": result,
                                        "created_at": datetime.now(timezone.utc).isoformat()})
    result["cached"] = False
    result["hash"] = digest
    result["filename"] = file.filename
    result["duplicate"] = await _find_duplicate(result["series"], result["issue"],
                                                result["category"], result["publisher"], result["year"])
    return result

class ImportItem(BaseModel):
    title: str = ""
    author: str = ""
    series: str = ""
    publisher: str = ""
    category: str = "VO"
    price: float = 0.0
    stock: int = 1
    condition: str = "Bon état"
    year: str = ""
    issue: str = ""
    description: str = ""
    description_en: str = ""
    description_es: str = ""
    cover_image: str = ""

class BulkCreateBody(BaseModel):
    items: List[ImportItem]

@api.post("/admin/import/bulk-create")
async def import_bulk_create(body: BulkCreateBody, admin: dict = Depends(get_current_admin)):
    created = 0
    series_seen = set()
    for item in body.items:
        data = item.model_dump()
        # normalize INCONNU/À VÉRIFIER placeholders
        for k in ("series", "issue", "publisher", "author", "year"):
            if str(data.get(k, "")).strip().upper() in ("INCONNU", "À VÉRIFIER", "A VERIFIER"):
                data[k] = ""
        prod = Product(**data).model_dump(by_alias=True, exclude={"id"})
        prod["created_at"] = prod["created_at"].isoformat()
        prod["slug"] = await _unique_slug(_slugify(prod.get("title"), prod.get("issue")))
        await db.products.insert_one(prod)
        created += 1
        s = data.get("series", "").strip()
        if s and s not in series_seen:
            series_seen.add(s)
            if not await db.series_list.find_one({"name": s}):
                await db.series_list.insert_one({"name": s, "created_at": datetime.now(timezone.utc).isoformat()})
    return {"created": created}

class ImportSessionBody(BaseModel):
    total_photos: int = 0
    analyzed: int = 0
    imported: int = 0
    errors: int = 0
    duplicates: int = 0

@api.post("/admin/import/session")
async def save_import_session(body: ImportSessionBody, admin: dict = Depends(get_current_admin)):
    doc = body.model_dump()
    doc["date"] = datetime.now(timezone.utc).isoformat()
    res = await db.import_sessions.insert_one(doc)
    return {"id": str(res.inserted_id), "date": doc["date"], **body.model_dump()}

@api.get("/admin/import/sessions")
async def list_import_sessions(admin: dict = Depends(get_current_admin)):
    docs = await db.import_sessions.find().sort("date", -1).to_list(50)
    out = []
    for d in docs:
        d["id"] = str(d.pop("_id"))
        out.append(d)
    return out

def _addr(a):
    if not a:
        return None
    return {"line1": a.get("line1"), "line2": a.get("line2"),
            "postal_code": a.get("postal_code"), "city": a.get("city"),
            "state": a.get("state"), "country": a.get("country")}

def _customer_payload(s):
    """Extrait nom/email/téléphone + adresses de livraison/facturation d'une session Stripe."""
    cd = s.get("customer_details") or {}
    sd = s.get("shipping_details") or s.get("shipping") or {}
    out = {}
    cust = {k: cd.get(k) for k in ("name", "email", "phone") if cd.get(k)}
    if cust:
        out["customer"] = cust
    if cd.get("address"):
        out["billing"] = {"name": cd.get("name"), "address": _addr(cd["address"])}
    if sd and (sd.get("name") or sd.get("address")):
        out["shipping"] = {"name": sd.get("name"), "address": _addr(sd.get("address"))}
    return out


@api.get("/admin/orders")
async def list_orders(admin: dict = Depends(get_current_admin)):
    docs = await db.payment_transactions.find().sort("created_at", -1).to_list(500)
    # Rattrapage paresseux : infos client Stripe pour les commandes payées sans fiche client
    missing = [d for d in docs if d.get("payment_status") == "paid" and not d.get("customer")][:10]
    for d in missing:
        try:
            s = stripe.checkout.Session.retrieve(d["session_id"])
            cust = _customer_payload(s)
            if cust:
                await db.payment_transactions.update_one({"session_id": d["session_id"]}, {"$set": cust})
                d.update(cust)
        except Exception:
            pass
    out = []
    # Lien fiche publique depuis les commandes : slugs des produits commandés
    pids = list({i.get("product_id") for d in docs for i in d.get("items", []) if i.get("product_id")})
    slug_map = {}
    oids = [ObjectId(p) for p in pids if ObjectId.is_valid(p)]
    if oids:
        async for p in db.products.find({"_id": {"$in": oids}}, {"slug": 1}):
            slug_map[str(p["_id"])] = p.get("slug")
    for d in docs:
        d.pop("_id", None)
        d.setdefault("fulfillment_status", "a_traiter")
        for i in d.get("items", []):
            slug = slug_map.get(i.get("product_id"))
            if slug:
                i["slug"] = slug
        for k in ("created_at", "updated_at", "shipped_at"):
            if isinstance(d.get(k), datetime):
                d[k] = d[k].isoformat()
        out.append(d)
    return out

async def _maybe_send_shipping_email(session_id: str) -> bool:
    """Email d'expédition au client, une seule fois par commande (flag posé avant envoi)."""
    order = await db.payment_transactions.find_one({"session_id": session_id})
    if not order or order.get("shipping_email_sent"):
        return False
    to = (order.get("customer") or {}).get("email")
    if not to:
        return False
    await db.payment_transactions.update_one(
        {"session_id": session_id}, {"$set": {"shipping_email_sent": True}})
    try:
        await send_email(to=to,
                         subject="Votre commande Moulin Comics est expédiée",
                         html=_shipping_email_html(order))
        return True
    except Exception:
        await db.payment_transactions.update_one(
            {"session_id": session_id}, {"$unset": {"shipping_email_sent": ""}})
        raise

class FulfillmentUpdate(BaseModel):
    fulfillment_status: str

@api.put("/admin/orders/{session_id}/status")
async def update_order_status(session_id: str, body: FulfillmentUpdate,
                              admin: dict = Depends(get_current_admin)):
    """État COMMANDE (ce que le gérant doit faire). Actions couplées :
    prete_expedition → livraison preparee ; expediee → livraison expediee + date + email ;
    annulee → livraison annulee."""
    if body.fulfillment_status not in ORDER_STATES:
        raise HTTPException(400, "Statut invalide")
    order = await db.payment_transactions.find_one({"session_id": session_id})
    if not order:
        raise HTTPException(404, "Commande introuvable")
    now = datetime.now(timezone.utc)
    new_state = body.fulfillment_status
    updates = {"fulfillment_status": new_state, "updated_at": now}
    cur_ship = order.get("shipping_status") or "a_preparer"
    if new_state == "prete_expedition" and cur_ship == "a_preparer":
        updates["shipping_status"] = "preparee"
    elif new_state == "expediee":
        if cur_ship in ("a_preparer", "preparee"):
            updates["shipping_status"] = "expediee"
        if not order.get("shipped_at"):
            updates["shipped_at"] = now
    elif new_state == "annulee":
        updates["shipping_status"] = "annulee"
    await db.payment_transactions.update_one({"session_id": session_id}, {"$set": updates})
    email_sent = False
    if new_state == "expediee" and order.get("fulfillment_status") != "expediee":
        try:
            email_sent = await _maybe_send_shipping_email(session_id)
        except Exception as e:
            logging.getLogger(__name__).error(f"shipping email error: {e}")
    return {"ok": True, "fulfillment_status": new_state,
            "shipping_status": updates.get("shipping_status", cur_ship), "email_sent": email_sent}

class OrdersBulkDelete(BaseModel):
    session_ids: List[str]

@api.post("/admin/orders/bulk-delete")
async def bulk_delete_orders(body: OrdersBulkDelete, admin: dict = Depends(get_current_admin)):
    if not body.session_ids:
        raise HTTPException(400, "Aucune commande sélectionnée")
    res = await db.payment_transactions.delete_many({"session_id": {"$in": body.session_ids}})
    return {"deleted": res.deleted_count}

# ----- Payments (Stripe) -----
@api.post("/payments/checkout")
async def create_checkout(req: CheckoutRequest):
    if not req.items:
        raise HTTPException(400, "Panier vide")
    # Mode vacances : blocage serveur AVANT toute création de session Stripe.
    vac = _merge_content(await db.site_content.find_one({"key": "home"}) or {}).get("vacation", {})
    if vac.get("enabled"):
        raise HTTPException(409, vac.get("message") or DEFAULT_CONTENT["vacation"]["message"])
    line_items = []
    summary = []
    total = 0.0
    for item in req.items:
        prod = await db.products.find_one({"_id": ObjectId(item.product_id)})
        if not prod:
            raise HTTPException(404, f"Produit introuvable: {item.product_id}")
        if prod.get("stock", 0) < item.quantity:
            raise HTTPException(400, f"Stock insuffisant: {prod['title']}")
        unit = float(prod["price"])
        total += unit * item.quantity
        line_items.append({
            "price_data": {
                "currency": "eur",
                "unit_amount": int(round(unit * 100)),
                "product_data": {"name": f"{prod['title']}"[:120]},
            },
            "quantity": item.quantity,
        })
        summary.append({"product_id": item.product_id, "title": prod["title"],
                        "quantity": item.quantity, "price": unit})

    # --- Livraison : méthode et tarif contrôlés côté serveur (jamais le prix du frontend) ---
    ship_doc: dict = {}
    if req.shipping_method:
        if req.shipping_method not in SHIPPING_METHODS:
            raise HTTPException(400, "Méthode de livraison inconnue")
        cfg = await _shipping_config()
        if req.shipping_method == "mondial_relay":
            if not mr_api1_configured():
                raise HTTPException(503, "MONDIAL_RELAY_NOT_CONFIGURED")
            if not req.relay_point or not req.relay_point.id:
                raise HTTPException(400, "Veuillez sélectionner un Point Relais Mondial Relay avant de continuer.")
            rp = req.relay_point
            ship_doc = {
                "shipping_method": "mondial_relay",
                "shipping_price": cfg["mondial_relay_price"],
                "shipping_country": "FR",
                "relay_point_id": rp.id, "relay_point_name": rp.name, "relay_point_type": rp.type,
                "relay_point_address": rp.address, "relay_point_postal_code": rp.postal_code,
                "relay_point_city": rp.city, "relay_point_country": rp.country,
                "relay_point_latitude": rp.latitude, "relay_point_longitude": rp.longitude,
            }
        else:
            ship_doc = {"shipping_method": "home_delivery",
                        "shipping_price": cfg["home_delivery_price"],
                        "shipping_country": ""}
        shipping_label = ("Livraison — Mondial Relay Point Relais" if req.shipping_method == "mondial_relay"
                          else "Livraison à domicile")
        total += ship_doc["shipping_price"]
        line_items.append({
            "price_data": {
                "currency": "eur",
                "unit_amount": int(round(ship_doc["shipping_price"] * 100)),
                "product_data": {"name": shipping_label},
            },
            "quantity": 1,
        })
    ship_doc.setdefault("shipping_status", "a_preparer")
    ship_doc.setdefault("tracking_number", None)
    ship_doc.setdefault("shipping_label_url", None)

    kwargs = dict(
        line_items=line_items,
        mode="payment",
        success_url=f"{req.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{req.origin_url}/payment/cancel",
        metadata={"shipping_method": req.shipping_method or "",
                  "relay_point_id": ship_doc.get("relay_point_id", "")},
    )
    # Adresse de livraison Stripe demandée uniquement à domicile — inutile pour un Point Relais.
    if req.shipping_method != "mondial_relay":
        kwargs["shipping_address_collection"] = {"allowed_countries": ["FR", "BE", "CH", "LU", "DE", "ES", "IT", "GB", "NL"]}
    try:
        session = stripe.checkout.Session.create(
            **kwargs, automatic_tax={"enabled": True}, billing_address_collection="required")
    except stripe.error.StripeError:
        session = stripe.checkout.Session.create(**kwargs)

    await db.payment_transactions.insert_one({
        "session_id": session.id, "items": summary, "amount": total, "currency": "eur",
        "status": "initiated", "payment_status": "pending",
        "fulfillment_status": "a_traiter",
        **ship_doc,
        "created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc),
    })
    return {"checkout_url": session.url, "session_id": session.id}

@api.get("/payments/status/{session_id}")
async def payment_status(session_id: str):
    record = await db.payment_transactions.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(404, "Transaction introuvable")
    if record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            cust = _customer_payload(s)
            if cust:
                await db.payment_transactions.update_one({"session_id": session_id}, {"$set": cust})
            if s.payment_status == "paid" or s.status == "complete":
                await db.payment_transactions.update_one(
                    {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {"$set": {"status": "completed", "payment_status": "paid",
                              "updated_at": datetime.now(timezone.utc)}})
                await _decrement_stock(session_id)
                try:
                    await _maybe_send_confirmation_email(session_id)
                except Exception as e:
                    logging.getLogger(__name__).error(f"confirmation email error: {e}")
                try:
                    await _maybe_send_admin_order_notification(session_id)
                except Exception as e:
                    logging.getLogger(__name__).error(f"admin order notif error: {e}")
                record = await db.payment_transactions.find_one({"session_id": session_id})
        except stripe.error.StripeError:
            pass
    return {"session_id": record["session_id"], "status": record["status"],
            "payment_status": record["payment_status"], "amount": record.get("amount"),
            "items": record.get("items", []),
            "shipping_method": record.get("shipping_method"),
            "shipping_price": record.get("shipping_price"),
            "relay_point_name": record.get("relay_point_name"),
            "relay_point_type": record.get("relay_point_type"),
            "relay_point_address": record.get("relay_point_address"),
            "relay_point_postal_code": record.get("relay_point_postal_code"),
            "relay_point_city": record.get("relay_point_city")}

async def _decrement_stock(session_id: str):
    rec = await db.payment_transactions.find_one({"session_id": session_id})
    if not rec or rec.get("stock_applied"):
        return
    for it in rec.get("items", []):
        try:
            await db.products.update_one({"_id": ObjectId(it["product_id"])},
                                         {"$inc": {"stock": -int(it["quantity"])}})
        except Exception:
            pass
    await db.payment_transactions.update_one({"session_id": session_id},
                                             {"$set": {"stock_applied": True}})

@api.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(400, "Signature invalide")
    obj, t = event["data"]["object"], event["type"]
    if t == "checkout.session.completed":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"], "payment_status": {"$ne": "paid"}},
            {"$set": {"status": "completed", "payment_status": obj.get("payment_status", "paid"),
                      "updated_at": datetime.now(timezone.utc)}})
        cust = _customer_payload(obj)
        if cust:
            await db.payment_transactions.update_one({"session_id": obj["id"]}, {"$set": cust})
        await _decrement_stock(obj["id"])
        try:
            await _maybe_send_confirmation_email(obj["id"])
        except Exception as e:
            logging.getLogger(__name__).error(f"confirmation email error: {e}")
        try:
            await _maybe_send_admin_order_notification(obj["id"])
        except Exception as e:
            logging.getLogger(__name__).error(f"admin order notif error: {e}")
    return {"status": "ok"}

# ===== CONTENU ÉDITORIAL (site_content) =====
# Contenus par défaut des pages légales (éditables dans l'admin, section site_content).
# Placeholders [À COMPLÉTER : …] pour les informations légales non connues du projet.
LEGAL_MENTIONS_HTML = """<h2>Mentions légales</h2>
<p><strong>Éditeur du site</strong><br>
Moulin Comics — [À COMPLÉTER : nom / raison sociale]<br>
[À COMPLÉTER : adresse]<br>
SIRET : [À COMPLÉTER : SIRET]<br>
Contact : [À COMPLÉTER : e-mail] ou via la page <a href="/contact">Contact</a></p>
<p><strong>Directeur de la publication</strong><br>[À COMPLÉTER : nom du directeur de la publication]</p>
<p><strong>Hébergeur</strong><br>[À COMPLÉTER : hébergeur]</p>
<h3>Propriété intellectuelle</h3>
<p>L'ensemble des éléments du site moulincomics.com (textes, logo, photographies) est protégé par le droit de la propriété intellectuelle. Toute reproduction ou utilisation sans autorisation écrite préalable est interdite. Les couvertures de comics présentées restent la propriété de leurs éditeurs respectifs.</p>
<h3>Photographies des produits</h3>
<p>Les photographies du site sont réalisées à partir des exemplaires effectivement en stock, ou présentées à titre indicatif selon les produits. L'état exact de chaque comic est celui indiqué sur sa fiche produit.</p>
<h2>Politique de confidentialité</h2>
<p>Moulin Comics attache une importance particulière à la protection de vos données personnelles, conformément au Règlement (UE) 2016/679 (RGPD) et à la loi Informatique et Libertés.</p>
<h3>Données collectées</h3>
<p>Dans le cadre des commandes et de la relation client, seules les données nécessaires sont collectées :</p>
<ul>
<li>nom et prénom ;</li>
<li>adresse postale de livraison ou Point Relais choisi ;</li>
<li>adresse e-mail ;</li>
<li>numéro de téléphone (le cas échéant) ;</li>
<li>contenu des messages envoyés via le formulaire de contact.</li>
</ul>
<p><strong>Données bancaires :</strong> les paiements sont traités directement par Stripe, prestataire de paiement sécurisé. Moulin Comics n'a jamais accès à vos données bancaires et ne les conserve pas.</p>
<h3>Utilisation des données</h3>
<p>Vos données servent exclusivement à :</p>
<ul>
<li>la gestion et la livraison de vos commandes ;</li>
<li>les e-mails liés à votre commande (confirmation, expédition) ;</li>
<li>la réponse à vos messages ;</li>
<li>la prévention de la fraude et la sécurité du site.</li>
</ul>
<p>Elles ne sont ni vendues ni cédées à des tiers à des fins commerciales.</p>
<h3>Durée de conservation</h3>
<p>Les données sont conservées pendant la durée nécessaire à la gestion de vos commandes, augmentée des durées légales de conservation comptable et fiscale.</p>
<h3>Vos droits</h3>
<p>Vous disposez d'un droit d'accès, de rectification, d'effacement, d'opposition, de limitation et de portabilité de vos données. Pour les exercer : [À COMPLÉTER : e-mail] ou la page <a href="/contact">Contact</a>. Vous pouvez également adresser une réclamation à la CNIL (<a href="https://www.cnil.fr">www.cnil.fr</a>).</p>
<h3>Cookies</h3>
<p>Le site utilise des cookies strictement nécessaires à son fonctionnement (panier, préférences d'affichage). Lors de votre première visite, un bandeau vous permet d'accepter ou de refuser les cookies facultatifs ; vous pouvez modifier votre choix à tout moment depuis le lien « Préférences cookies » en pied de page.</p>
<h3>Droit applicable</h3>
<p>Les présentes mentions légales et la politique de confidentialité sont soumises au droit français.</p>"""

LEGAL_CGV_HTML = """<p><em>Version à jour au [À COMPLÉTER : date de mise à jour].</em></p>
<h2>Article 1 — Objet et champ d'application</h2>
<p>Les présentes conditions générales de vente (ci-après « CGV ») régissent les ventes de comics conclues entre Moulin Comics — [À COMPLÉTER : nom / raison sociale], [À COMPLÉTER : adresse], SIRET [À COMPLÉTER : SIRET] — (ci-après « le Vendeur ») et toute personne physique agissant en qualité de consommateur (ci-après « le Client »), via le site moulincomics.com. Toute commande passée sur le site implique l'acceptation sans réserve des présentes CGV.</p>
<h2>Article 2 — Produits</h2>
<p>Le site propose des comics neufs et d'occasion, en version originale (VO) et en version française (VF). Chaque fiche produit précise le titre, le numéro, l'état et le prix. Les photographies sont réalisées à partir des exemplaires en stock ou présentées à titre indicatif ; l'état contractuel est celui indiqué sur la fiche produit. Les produits sont proposés dans la limite des stocks disponibles — de nombreux exemplaires sont uniques.</p>
<h2>Article 3 — Prix</h2>
<p>Les prix sont indiqués en euros (€). [À COMPLÉTER : mention TVA applicable]. Les frais de livraison ne sont pas inclus dans le prix des produits : ils sont calculés et affichés avant la validation définitive de la commande. Le Vendeur peut modifier ses prix à tout moment ; le prix applicable est celui en vigueur au moment de la validation de la commande.</p>
<h2>Article 4 — Commande</h2>
<p>Le Client passe commande via le panier du site, choisit son mode de livraison puis procède au paiement. La validation de la commande vaut acceptation des produits, des prix et des présentes CGV. Un e-mail de confirmation récapitulant la commande est adressé au Client après paiement. Le Vendeur se réserve le droit de refuser ou d'annuler une commande en cas de litige antérieur ou d'anomalie ; toute commande annulée est intégralement remboursée.</p>
<h2>Article 5 — Paiement</h2>
<p>Le paiement est exigible immédiatement à la commande et s'effectue en ligne par carte bancaire, via la plateforme sécurisée Stripe. Le Vendeur n'a accès à aucune donnée bancaire du Client.</p>
<h2>Article 6 — Livraison</h2>
<p>Les commandes sont livrées à domicile ou en Point Relais Mondial Relay, selon le choix du Client lors de la commande, à l'adresse ou au point relais qu'il a indiqué. Les modalités détaillées figurent dans la <a href="/politique-livraison">Politique de livraison</a>. Les délais sont indiqués à titre estimatif ; conformément à l'article L216-1 du Code de la consommation, en cas de dépassement du délai supérieur à trente (30) jours, le Client peut demander l'annulation de la vente et son remboursement. Le transfert des risques intervient à la remise effective du colis au Client ou au point relais choisi.</p>
<h2>Article 7 — Droit de rétractation</h2>
<p>Conformément aux articles L221-18 et suivants du Code de la consommation, le Client dispose de quatorze (14) jours à compter de la réception du produit pour exercer son droit de rétractation, sans avoir à se justifier. Pour l'exercer : [À COMPLÉTER : e-mail] ou la page <a href="/contact">Contact</a>. Les frais de retour sont à la charge du Client et le produit doit être retourné dans son état d'origine. Le remboursement intervient dans un délai de quatorze (14) jours à compter de la réception du retour ou de la preuve de son expédition.</p>
<h2>Article 8 — Garanties légales</h2>
<p>Le Client bénéficie de la garantie légale de conformité (articles L217-3 et suivants du Code de la consommation — ramenée à douze (12) mois pour les biens d'occasion) et de la garantie des vices cachés (articles 1641 et suivants du Code civil — deux (2) ans à compter de la découverte du vice). Sont exclues l'usure normale liée à la nature d'occasion du produit ainsi que les altérations postérieures à la vente ou visibles sur la fiche produit.</p>
<h2>Article 9 — Données personnelles</h2>
<p>Les données personnelles sont traitées conformément à la politique de confidentialité, consultable sur la page <a href="/mentions-legales">Mentions légales &amp; Confidentialité</a>.</p>
<h2>Article 10 — Médiation et litiges</h2>
<p>En cas de litige, le Client est invité à contacter le Vendeur en priorité via la page <a href="/contact">Contact</a>. À défaut d'accord amiable, il peut recourir gratuitement à un médiateur de la consommation : [À COMPLÉTER : médiateur de la consommation]. Plateforme européenne de règlement en ligne des litiges : <a href="https://ec.europa.eu/consumers/odr">ec.europa.eu/consumers/odr</a>.</p>
<h2>Article 11 — Droit applicable</h2>
<p>Les présentes CGV sont soumises au droit français. Si une clause était déclarée nulle, les autres dispositions demeurent applicables.</p>"""

SHIPPING_POLICY_HTML = """<p>Cette page détaille les modalités de livraison des commandes passées sur moulincomics.com. Elle complète nos <a href="/cgv">Conditions générales de vente</a>.</p>
<h2>Modes de livraison proposés</h2>
<ul>
<li><strong>Livraison à domicile</strong> — le colis est remis à l'adresse indiquée lors de la commande.</li>
<li><strong>Point Relais Mondial Relay</strong> — vous choisissez votre point relais directement au moment de la commande ; c'est lui qui constitue la destination de livraison.</li>
</ul>
<h2>Tarifs</h2>
<p>Les frais de livraison dépendent du mode choisi et sont affichés clairement dans le panier, avant tout paiement. Le tarif applicable est celui affiché au moment de la commande.</p>
<h2>Zones desservies</h2>
<p>La livraison en Point Relais est disponible en France. La livraison à domicile est proposée en France et dans plusieurs pays européens (la liste des pays est indiquée lors de la saisie de l'adresse de livraison). Pour toute livraison hors Union européenne, d'éventuels droits de douane ou taxes locales peuvent être exigés par le pays de destination et restent à la charge du client.</p>
<h2>Délais</h2>
<p>Les commandes sont préparées avec soin, avec une protection adaptée des comics, puis remises au transporteur. Les délais de préparation et d'acheminement sont donnés à titre indicatif et peuvent varier selon l'activité et le transporteur.</p>
<h2>Suivi de commande</h2>
<p>Un e-mail vous informe de l'expédition de votre commande. Pour toute question sur le suivi, contactez-nous via la page <a href="/contact">Contact</a> en précisant votre numéro de commande.</p>
<h2>Réception du colis</h2>
<p>À la réception, vérifiez l'état du colis et des produits. Toute anomalie liée au transport (colis endommagé, ouvert ou produit détérioré) doit être signalée dans les meilleurs délais — idéalement sous 3 jours ouvrés — via la page <a href="/contact">Contact</a>, afin que nous puissions effectuer les démarches auprès du transporteur. Cette procédure n'affecte en aucun cas vos garanties légales.</p>
<h2>Responsabilité</h2>
<p>Moulin Comics demeure responsable de la commande jusqu'à la remise effective du colis au client ou au point relais choisi.</p>"""

# FAQ publique (/faq) — initialisation unique au démarrage si la section est absente
# (seed_faq). Chaque entrée porte ses 3 langues ; l'admin les édite ensuite librement.
FAQ_CATEGORIES = ["Les comics", "Commande & paiement", "Livraison", "Retours & remboursements", "Moulin Comics"]
# Catégories produits : liste administrable (Admin → Catégories), stockée dans
# site_content.categories. Valeurs initiales posées une seule fois par seed_categories().
PRODUCT_CATEGORIES_DEFAULT = ["VF", "VO", "Nouveauté", "Marvel", "DC", "Comics vintage", "Petits prix", "Collectors"]
DEFAULT_FAQ_ITEMS = [
    {"category": "Les comics", "order": 1, "active": True,
     "question_fr": "Les comics vendus sur Moulin Comics sont-ils neufs ou d'occasion ?",
     "answer_fr": "<p>Moulin Comics propose principalement des comics d'occasion et de collection. L'état de chaque exemplaire est indiqué sur sa fiche produit et les photographies permettent d'apprécier l'exemplaire proposé à la vente.</p>",
     "question_en": "Are the comics sold on Moulin Comics new or second-hand?",
     "answer_en": "<p>Moulin Comics mainly offers second-hand and collectible comics. The condition of each copy is stated on its product page and the photographs show the actual copy offered for sale.</p>",
     "question_es": "¿Los cómics vendidos en Moulin Comics son nuevos o de segunda mano?",
     "answer_es": "<p>Moulin Comics ofrece principalmente cómics de segunda mano y de colección. El estado de cada ejemplar se indica en su ficha de producto y las fotografías permiten apreciar el ejemplar ofrecido a la venta.</p>"},
    {"category": "Les comics", "order": 2, "active": True,
     "question_fr": "Les photos correspondent-elles au comic que je vais recevoir ?",
     "answer_fr": "<p>Oui. Les photographies sont réalisées avec le plus grand soin et présentent l'exemplaire effectivement proposé à la vente. De légères différences de couleur ou d'aspect peuvent toutefois exister selon l'écran ou l'appareil utilisé.</p>",
     "question_en": "Do the photos match the comic I will receive?",
     "answer_en": "<p>Yes. Photographs are taken with the greatest care and show the actual copy offered for sale. Slight differences in colour or appearance may however occur depending on your screen or device.</p>",
     "question_es": "¿Las fotos corresponden al cómic que voy a recibir?",
     "answer_es": "<p>Sí. Las fotografías se realizan con el mayor cuidado y muestran el ejemplar efectivamente ofrecido a la venta. No obstante, pueden existir ligeras diferencias de color o aspecto según la pantalla o el dispositivo utilizado.</p>"},
    {"category": "Les comics", "order": 3, "active": True,
     "question_fr": "Comment est indiqué l'état d'un comic ?",
     "answer_fr": "<p>L'état de chaque comic est indiqué sur sa fiche produit. Pour les comics d'occasion et de collection, les éventuels défauts sont signalés et les photographies permettent d'évaluer précisément l'exemplaire proposé.</p>",
     "question_en": "How is the condition of a comic indicated?",
     "answer_en": "<p>The condition of each comic is stated on its product page. For second-hand and collectible comics, any defects are pointed out and the photographs allow you to assess the exact copy offered.</p>",
     "question_es": "¿Cómo se indica el estado de un cómic?",
     "answer_es": "<p>El estado de cada cómic se indica en su ficha de producto. Para los cómics de segunda mano y de colección, los posibles defectos se señalan y las fotografías permiten evaluar con precisión el ejemplar ofrecido.</p>"},
    {"category": "Les comics", "order": 4, "active": True,
     "question_fr": "Pourquoi certains comics ne sont-ils disponibles qu'en un seul exemplaire ?",
     "answer_fr": "<p>De nombreux comics proposés par Moulin Comics sont des pièces d'occasion ou de collection disponibles en un seul exemplaire. Une fois cet exemplaire vendu, il devient indisponible et ne peut pas nécessairement être remplacé par un exemplaire identique.</p>",
     "question_en": "Why are some comics available as a single copy only?",
     "answer_en": "<p>Many comics offered by Moulin Comics are second-hand or collectible items available as a single copy. Once that copy is sold, it becomes unavailable and cannot necessarily be replaced by an identical one.</p>",
     "question_es": "¿Por qué algunos cómics solo están disponibles en un único ejemplar?",
     "answer_es": "<p>Muchos de los cómics ofrecidos por Moulin Comics son piezas de segunda mano o de colección disponibles en un único ejemplar. Una vez vendido, deja de estar disponible y no siempre puede sustituirse por un ejemplar idéntico.</p>"},
    {"category": "Les comics", "order": 5, "active": True,
     "question_fr": "Un comic épuisé peut-il revenir en stock ?",
     "answer_fr": "<p>Cela arrive : notre stock évolue au gré de nos trouvailles. N'hésitez pas à nous indiquer le comic recherché via la <a href=\"/contact\">page Contact</a> — nous gardons un œil sur nos arrivages.</p>",
     "question_en": "Can a sold-out comic come back in stock?",
     "answer_en": "<p>It happens: our stock evolves with our finds. Feel free to tell us which comic you are looking for via the <a href=\"/contact\">Contact page</a> — we keep an eye on our arrivals for you.</p>",
     "question_es": "¿Un cómic agotado puede volver a estar disponible?",
     "answer_es": "<p>Puede ocurrir: nuestro stock evoluciona con nuestros hallazgos. No dude en indicarnos el cómic que busca a través de la <a href=\"/contact\">página de Contacto</a>: estaremos atentos a nuestras novedades.</p>"},
    {"category": "Les comics", "order": 6, "active": True,
     "question_fr": "Comment trouver rapidement un comic ou une série ?",
     "answer_fr": "<p>Utilisez la barre de recherche de la <a href=\"/shop\">boutique</a> ou les filtres par série en haut de la page. Vous pouvez aussi n'afficher que les comics en stock.</p>",
     "question_en": "How can I quickly find a comic or a series?",
     "answer_en": "<p>Use the search bar in the <a href=\"/shop\">shop</a> or the series filters at the top of the page. You can also display only in-stock comics.</p>",
     "question_es": "¿Cómo encontrar rápidamente un cómic o una serie?",
     "answer_es": "<p>Utilice la barra de búsqueda de la <a href=\"/shop\">tienda</a> o los filtros por serie en la parte superior de la página. También puede mostrar únicamente los cómics en stock.</p>"},
    {"category": "Commande & paiement", "order": 7, "active": True,
     "question_fr": "Comment passer une commande ?",
     "answer_fr": "<p>Ajoutez vos comics au panier, cliquez sur « Commander », choisissez votre mode de livraison puis laissez-vous guider jusqu'au paiement sécurisé. Vous recevez ensuite une confirmation par e-mail.</p>",
     "question_en": "How do I place an order?",
     "answer_en": "<p>Add your comics to the cart, click \"Checkout\", choose your delivery method and follow the steps to the secure payment. You will then receive a confirmation e-mail.</p>",
     "question_es": "¿Cómo realizar un pedido?",
     "answer_es": "<p>Añada sus cómics al carrito, haga clic en «Tramitar pedido», elija su método de entrega y siga los pasos hasta el pago seguro. A continuación recibirá una confirmación por correo electrónico.</p>"},
    {"category": "Commande & paiement", "order": 8, "active": True,
     "question_fr": "Le paiement est-il sécurisé ?",
     "answer_fr": "<p>Oui. Les paiements sont traités par Stripe, plateforme de paiement sécurisée. Vos données bancaires ne transitent jamais par nos serveurs.</p>",
     "question_en": "Is payment secure?",
     "answer_en": "<p>Yes. Payments are processed by Stripe, a secure payment platform. Your banking details never pass through our servers.</p>",
     "question_es": "¿El pago es seguro?",
     "answer_es": "<p>Sí. Los pagos son procesados por Stripe, una plataforma de pago segura. Sus datos bancarios nunca pasan por nuestros servidores.</p>"},
    {"category": "Commande & paiement", "order": 9, "active": True,
     "question_fr": "Puis-je modifier ou annuler ma commande après le paiement ?",
     "answer_fr": "<p>Contactez-nous au plus vite via la <a href=\"/contact\">page Contact</a> en indiquant votre numéro de commande : tant que la commande n'est pas expédiée, nous faisons le nécessaire.</p>",
     "question_en": "Can I change or cancel my order after payment?",
     "answer_en": "<p>Contact us as soon as possible via the <a href=\"/contact\">Contact page</a>, quoting your order number: as long as the order has not been dispatched, we will take care of it.</p>",
     "question_es": "¿Puedo modificar o cancelar mi pedido después del pago?",
     "answer_es": "<p>Contáctenos lo antes posible a través de la <a href=\"/contact\">página de Contacto</a> indicando su número de pedido: mientras el pedido no haya sido enviado, nos ocuparemos de ello.</p>"},
    {"category": "Livraison", "order": 10, "active": True,
     "question_fr": "Quels modes de livraison proposez-vous ?",
     "answer_fr": "<p>La livraison à domicile et la livraison en Point Relais ou Locker Mondial Relay. Toutes les modalités (tarifs, zones, délais) sont détaillées sur la page <a href=\"/politique-livraison\">Politique de livraison</a>.</p>",
     "question_en": "What delivery methods do you offer?",
     "answer_en": "<p>Home delivery and delivery to a Mondial Relay Point Relais or Locker. All details (rates, areas, times) are on the <a href=\"/politique-livraison\">Shipping Policy</a> page.</p>",
     "question_es": "¿Qué métodos de entrega ofrecen?",
     "answer_es": "<p>La entrega a domicilio y la entrega en Point Relais o Locker de Mondial Relay. Todas las condiciones (tarifas, zonas, plazos) se detallan en la página <a href=\"/politique-livraison\">Política de envío</a>.</p>"},
    {"category": "Livraison", "order": 11, "active": True,
     "question_fr": "Comment choisir mon Point Relais ou Locker Mondial Relay ?",
     "answer_fr": "<p>Lors de la commande, choisissez « Point Relais / Locker Mondial Relay », recherchez par code postal ou ville, puis sélectionnez votre point dans la liste avant de valider. Vérifiez-le attentivement avant de confirmer.</p>",
     "question_en": "How do I choose my Mondial Relay Point Relais or Locker?",
     "answer_en": "<p>When ordering, choose \"Mondial Relay Point Relais / Locker\", search by postcode or city, then select your point from the list before confirming. Please check it carefully before validating.</p>",
     "question_es": "¿Cómo elegir mi Point Relais o Locker de Mondial Relay?",
     "answer_es": "<p>Al realizar el pedido, elija «Point Relais / Locker Mondial Relay», busque por código postal o ciudad y seleccione su punto en la lista antes de confirmar. Verifíquelo atentamente antes de validar.</p>"},
    {"category": "Livraison", "order": 12, "active": True,
     "question_fr": "Sous combien de temps ma commande est-elle expédiée ?",
     "answer_fr": "<p>Nous préparons et expédions les commandes dans un délai maximal de 4 jours ouvrés après confirmation du paiement, sauf circonstances exceptionnelles ou information contraire clairement indiquée sur le site.</p>",
     "question_en": "How quickly will my order be dispatched?",
     "answer_en": "<p>We prepare and dispatch orders within a maximum of 4 working days after payment confirmation, except in exceptional circumstances or where otherwise clearly indicated on the site.</p>",
     "question_es": "¿En cuánto tiempo se envía mi pedido?",
     "answer_es": "<p>Preparamos y enviamos los pedidos en un plazo máximo de 4 días laborables tras la confirmación del pago, salvo circunstancias excepcionales o información contraria claramente indicada en el sitio.</p>"},
    {"category": "Livraison", "order": 13, "active": True,
     "question_fr": "Comment suivre mon colis ?",
     "answer_fr": "<p>Lors de l'expédition, vous recevez un e-mail avec les informations de suivi dès qu'elles sont disponibles.</p>",
     "question_en": "How can I track my parcel?",
     "answer_en": "<p>When your order is dispatched, you receive an e-mail with the tracking information as soon as it is available.</p>",
     "question_es": "¿Cómo puedo seguir mi paquete?",
     "answer_es": "<p>Al expedir su pedido, recibirá un correo electrónico con la información de seguimiento en cuanto esté disponible.</p>"},
    {"category": "Livraison", "order": 14, "active": True,
     "question_fr": "Que faire si mon colis est endommagé ou n'arrive pas ?",
     "answer_fr": "<p>Contactez-nous dans les meilleurs délais via la <a href=\"/contact\">page Contact</a> en indiquant votre numéro de commande et, si possible, des photos du colis. Les démarches à suivre sont détaillées dans la <a href=\"/politique-livraison\">Politique de livraison</a>.</p>",
     "question_en": "What should I do if my parcel is damaged or does not arrive?",
     "answer_en": "<p>Contact us as soon as possible via the <a href=\"/contact\">Contact page</a>, quoting your order number and, if possible, photos of the parcel. The steps to follow are detailed in the <a href=\"/politique-livraison\">Shipping Policy</a>.</p>",
     "question_es": "¿Qué hago si mi paquete llega dañado o no llega?",
     "answer_es": "<p>Contáctenos lo antes posible a través de la <a href=\"/contact\">página de Contacto</a>, indicando su número de pedido y, si es posible, fotos del paquete. Los pasos a seguir se detallan en la <a href=\"/politique-livraison\">Política de envío</a>.</p>"},
    {"category": "Retours & remboursements", "order": 15, "active": True,
     "question_fr": "Puis-je retourner un comic si je change d'avis ?",
     "answer_fr": "<p>Oui, vous disposez d'un droit de rétractation de 14 jours à compter de la réception de votre commande. Les conditions et modalités de retour et de remboursement sont détaillées dans les <a href=\"/cgv\">Conditions Générales de Vente</a>.</p>",
     "question_en": "Can I return a comic if I change my mind?",
     "answer_en": "<p>Yes, you have a 14-day right of withdrawal from receipt of your order. The return and refund conditions are detailed in the <a href=\"/cgv\">Terms and Conditions of Sale</a>.</p>",
     "question_es": "¿Puedo devolver un cómic si cambio de opinión?",
     "answer_es": "<p>Sí, dispone de un derecho de desistimiento de 14 días a partir de la recepción de su pedido. Las condiciones de devolución y reembolso se detallan en las <a href=\"/cgv\">Condiciones Generales de Venta</a>.</p>"},
    {"category": "Retours & remboursements", "order": 16, "active": True,
     "question_fr": "Qui paie les frais de retour en cas de rétractation ?",
     "answer_fr": "<p>En cas de rétractation, les frais de retour restent à la charge du client, conformément aux <a href=\"/cgv\">Conditions Générales de Vente</a>.</p>",
     "question_en": "Who pays the return costs in case of withdrawal?",
     "answer_en": "<p>In case of withdrawal, return costs are borne by the customer, in accordance with the <a href=\"/cgv\">Terms and Conditions of Sale</a>.</p>",
     "question_es": "¿Quién paga los gastos de devolución en caso de desistimiento?",
     "answer_es": "<p>En caso de desistimiento, los gastos de devolución corren a cargo del cliente, conforme a las <a href=\"/cgv\">Condiciones Generales de Venta</a>.</p>"},
    {"category": "Moulin Comics", "order": 17, "active": True,
     "question_fr": "Puis-je acheter vos comics directement lors d'un salon ou d'une convention ?",
     "answer_fr": "<p>Oui ! Nous sillonnons les conventions d'Europe avec une sélection triée sur le volet. Consultez l'agenda sur la page <a href=\"/conventions\">Salons</a> et passez nous voir à notre stand.</p>",
     "question_en": "Can I buy your comics directly at a convention or event?",
     "answer_en": "<p>Yes! We travel to conventions across Europe with a hand-picked selection. Check the schedule on the <a href=\"/conventions\">Events</a> page and come dig through our booth.</p>",
     "question_es": "¿Puedo comprar sus cómics directamente en un salón o convención?",
     "answer_es": "<p>¡Sí! Recorremos las convenciones de Europa con una selección cuidada. Consulte la agenda en la página de <a href=\"/conventions\">Salones</a> y venga a vernos a nuestro stand.</p>"},
    {"category": "Moulin Comics", "order": 18, "active": True,
     "question_fr": "Je recherche un comic précis qui n'est pas sur le site. Puis-je vous contacter ?",
     "answer_fr": "<p>Bien sûr. Écrivez-nous via la <a href=\"/contact\">page Contact</a> en indiquant le titre, la série ou le numéro recherché : nous gardons un œil sur nos arrivages pour vous.</p>",
     "question_en": "I am looking for a specific comic that is not on the site. Can I contact you?",
     "answer_en": "<p>Of course. Write to us via the <a href=\"/contact\">Contact page</a> with the title, series or issue number you are looking for: we keep an eye on our arrivals for you.</p>",
     "question_es": "Busco un cómic concreto que no está en el sitio. ¿Puedo contactarles?",
     "answer_es": "<p>Por supuesto. Escríbanos a través de la <a href=\"/contact\">página de Contacto</a> indicando el título, la serie o el número que busca: estaremos atentos a nuestras novedades por usted.</p>"},
    {"category": "Moulin Comics", "order": 19, "active": True,
     "question_fr": "Comment contacter Moulin Comics ?",
     "answer_fr": "<p>Via la <a href=\"/contact\">page Contact</a> du site, par e-mail ou par téléphone — nos coordonnées complètes figurent sur la page <a href=\"/mentions-legales\">Mentions légales</a>.</p>",
     "question_en": "How can I contact Moulin Comics?",
     "answer_en": "<p>Via the <a href=\"/contact\">Contact page</a> of the site, by e-mail or by phone — our full details are on the <a href=\"/mentions-legales\">Legal Notice</a> page.</p>",
     "question_es": "¿Cómo contactar con Moulin Comics?",
     "answer_es": "<p>A través de la <a href=\"/contact\">página de Contacto</a> del sitio, por correo electrónico o por teléfono — nuestros datos completos figuran en la página de <a href=\"/mentions-legales\">Aviso legal</a>.</p>"},
]

DEFAULT_CONTENT = {
    "hero": {
        "eyebrow": "Comic Shop · VO & VF · Paris",
        "title": "Moulin Comics —\nVotre prochaine pièce\nde collection est ici",
        "description": "BD & Comics français et américains — éditions anciennes, collectors et pépites à redécouvrir.",
        "primary_text": "Explorer le stock", "primary_url": "/shop",
        "secondary_text": "Les Spider-Man", "secondary_url": "/shop?series=Spider-Man",
        "image": "",
    },
    "maison": {"title": "La maison", "blocks": [
        {"n": "01", "title": "La VO d'abord", "text": "Comic shop spécialisé en version originale. Marvel, DC, indés — les titres qui définissent le médium, dans leur langue d'origine."},
        {"n": "02", "title": "Le fonds VF", "text": "Un large stock de mensuels : les bons vieux Strange, Nova et Titans de l'ère Lug & Semic. La nostalgie a une adresse."},
        {"n": "03", "title": "Sur les salons", "text": "On sillonne les conventions d'Europe avec une sélection triée sur le volet. Retrouvez-nous case après case."},
    ]},
    "salons": {
        "eyebrow": "Sur la route", "title": "RETROUVEZ-NOUS SUR LES SALONS D'EUROPE",
        "description": "De Paris à Bruxelles, d'Angoulême à Lucca — on déballe nos caisses partout en Europe. Une sélection différente à chaque étape.",
        "button_text": "Voir l'agenda", "button_url": "/conventions", "image": "",
        "video_enabled": False,
        "video_url": "", "video_poster": "", "video_instagram": "",
        "video_eyebrow": "L'ŒIL DU MOULIN", "video_title": "SUR LE TERRAIN",
        "video_text": "On fouille aussi les bacs ailleurs. Quelques trouvailles croisées sur la route des salons.",
    },
    "villes": ["Angoulême", "Comic Con Paris", "Lucca", "Bruxelles", "Lyon", "FIBD"],
    "seo": {
        "seo_title": "Moulin Comics — Comics Marvel, DC & BD de collection",
        "meta_description": "Moulin Comics sélectionne des comics Marvel, DC Comics, comics américains et BD de collection pour les passionnés et collectionneurs.",
        "og_title": "", "og_description": "", "og_image": "",
    },
    "contact": {
        "photo": "",
        "top_text": "",
        "bottom_text": "",
    },
    "shipping": {
        "mondial_relay_price": 4.90,
        "home_delivery_price": 7.90,
        "policy": SHIPPING_POLICY_HTML,
    },
    "vacation": {
        "enabled": False,
        "message": "Notre boutique est actuellement fermée pour congés. Les commandes reprendront prochainement.",
    },
    "legal": {
        "mentions": LEGAL_MENTIONS_HTML,
        "cgv": LEGAL_CGV_HTML,
    },
    "faq": {
        "items": [],
    },
    "categories": [],
    "footer": {
        "description": "Comic shop spécialisé en VO. Large stock de mensuels VF — Strange, Nova, Titans. De la case à la caisse depuis toujours.",
        "address": "Paris · France", "email": "bonjour@moulincomics.fr", "phone": "",
        "social": "", "links": [],
        "baseline": "Des comics à lire, à chercher, à collectionner.",
        "cta_title": "VOUS CHERCHEZ UN COMIC EN PARTICULIER ?",
        "cta_text": "Dites-nous ce qui manque à votre collection.",
        "cta_button": "NOUS CONTACTER",
        "instagram_url": "https://www.instagram.com/moulin_comics/",
    },
}
CONTENT_SECTIONS = set(DEFAULT_CONTENT.keys())

CONTENT_LANGS = ("en", "es")

def _merge_content(stored: dict) -> dict:
    out = {}
    for k, dv in DEFAULT_CONTENT.items():
        sv = (stored or {}).get(k)
        if isinstance(dv, dict) and isinstance(sv, dict):
            merged = dict(dv)
            for kk, vv in sv.items():
                if vv not in (None, "", []):
                    merged[kk] = vv
            out[k] = merged
        else:
            out[k] = sv if sv not in (None, "", []) else dv
    return out

@api.get("/content")
async def get_content():
    doc = await db.site_content.find_one({"key": "home"}) or {}
    return _merge_content(doc)

@api.put("/admin/content/{section}")
async def update_content(section: str, body: Any = Body(...), admin: dict = Depends(get_current_admin)):
    if section not in CONTENT_SECTIONS:
        raise HTTPException(400, "Section inconnue")
    await db.site_content.update_one({"key": "home"}, {"$set": {section: body}}, upsert=True)
    doc = await db.site_content.find_one({"key": "home"})
    return _merge_content(doc)

@api.put("/admin/content/{section}/{lang}")
async def update_content_lang(section: str, lang: str, body: dict = Body(...), admin: dict = Depends(get_current_admin)):
    if section not in CONTENT_SECTIONS:
        raise HTTPException(400, "Section inconnue")
    if lang not in CONTENT_LANGS:
        raise HTTPException(400, "Langue inconnue")
    if not isinstance(body, dict):
        raise HTTPException(400, "Contenu invalide")
    cleaned = {k: v for k, v in body.items() if v not in (None, "", []) and k not in CONTENT_LANGS}
    if cleaned:
        await db.site_content.update_one({"key": "home"}, {"$set": {f"{section}.{lang}": cleaned}}, upsert=True)
    else:
        await db.site_content.update_one({"key": "home"}, {"$unset": {f"{section}.{lang}": ""}})
    doc = await db.site_content.find_one({"key": "home"})
    return _merge_content(doc)

# ===== Livraison : méthodes + Mondial Relay =====
class ContactMessage(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=200)
    subject: str = Field(min_length=2, max_length=150)
    message: str = Field(min_length=5, max_length=5000)

@api.post("/contact")
async def contact(body: ContactMessage):
    """Formulaire de contact public — envoyé au gérant via le système d'email existant.
    Le destinataire est fixe côté serveur ; l'email du visiteur passe en reply-to."""
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", body.email):
        raise HTTPException(400, "Adresse email invalide")
    subj = re.sub(r"[\r\n]+", " ", body.subject).strip()
    html = (
        '<table role="presentation" width="100%" style="background:#f5f2ea;padding:24px 0">'
        '<tr><td align="center"><table role="presentation" width="560" style="background:#ffffff;border:2px solid #141414;font-family:Arial,sans-serif;color:#141414">'
        '<tr><td style="background:#141414;color:#f5f2ea;padding:16px 24px;font-size:18px;font-weight:bold;letter-spacing:2px">'
        + escape(EMAIL_FROM_NAME) + ' — Contact</td></tr>'
        '<tr><td style="padding:24px">'
        '<p style="font-size:14px"><strong>Nom :</strong> ' + escape(body.name) + '</p>'
        '<p style="font-size:14px"><strong>Email :</strong> ' + escape(body.email) + '</p>'
        '<p style="font-size:14px"><strong>Objet :</strong> ' + escape(subj) + '</p>'
        '<p style="font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#c8102e;margin:20px 0 6px">Message</p>'
        '<p style="font-size:14px;line-height:1.6;white-space:pre-wrap">' + escape(body.message) + '</p>'
        '</td></tr>'
        '<tr><td style="padding:14px 24px;font-size:11px;color:#888;border-top:1px solid #eee">'
        'Répondez directement à cet email pour répondre au visiteur.'
        '</td></tr></table></td></tr></table>'
    )
    try:
        await send_email(to=CONTACT_EMAIL.strip(),
                         subject=f"Contact site — {subj}"[:150],
                         html=html, reply_to=body.email)
    except ValueError as e:
        raise HTTPException(400, "Message refusé par le filtre de sécurité")
    except Exception as e:
        logger.error(f"contact email error: {type(e).__name__}")
        raise HTTPException(502, "L'envoi du message a échoué. Réessayez dans un instant.")
    return {"ok": True}

# ===== Livraison : méthodes + Mondial Relay =====
SHIPPING_METHODS = ("mondial_relay", "home_delivery")
SHIPPING_STATUSES = ("a_preparer", "preparee", "expediee", "en_transit",
                     "disponible_relais", "livree", "incident", "annulee")
# État de la commande (ce que le gérant doit faire) — vocabulaire de fulfillment_status
ORDER_STATES = ("a_traiter", "prete_expedition", "expediee", "terminee", "annulee")
ORDER_RANK = {s: i for i, s in enumerate(ORDER_STATES)}
# Synchronisation STATUT DE LIVRAISON -> COMMANDE (jamais de retour arrière,
# sauf incident/annulée qui sont des exceptions explicites)
SHIP_TO_ORDER = {"preparee": "prete_expedition", "expediee": "expediee", "en_transit": "expediee",
                 "disponible_relais": "expediee", "livree": "terminee",
                 "incident": "a_traiter", "annulee": "annulee"}
SHIP_FORCE = {"incident", "annulee"}

async def _shipping_config() -> dict:
    doc = await db.site_content.find_one({"key": "home"}) or {}
    stored = doc.get("shipping") or {}
    cfg = dict(DEFAULT_CONTENT["shipping"])
    for k in cfg:
        if isinstance(stored.get(k), (int, float)):
            cfg[k] = float(stored[k])
    return cfg

@api.get("/shipping/methods")
async def shipping_methods():
    cfg = await _shipping_config()
    return {
        "methods": [
            {"id": "mondial_relay", "label": "Mondial Relay — Point Relais / Locker",
             "price": cfg["mondial_relay_price"], "requires_relay": True,
             "available": mr_api1_configured(), "countries": ["FR"]},
            {"id": "home_delivery", "label": "Livraison à domicile",
             "price": cfg["home_delivery_price"], "requires_relay": False,
             "available": True, "countries": ["FR", "BE", "IT", "ES", "DE", "GB", "US"]},
        ]
    }

@api.get("/mondial-relay/points")
async def mondial_relay_points(postal_code: str = "", city: str = ""):
    if not mr_api1_configured():
        raise HTTPException(503, "MONDIAL_RELAY_NOT_CONFIGURED")
    postal_code = postal_code.strip()
    city = city.strip()
    if not postal_code and not city:
        raise HTTPException(400, "Code postal ou ville requis")
    if postal_code and (not postal_code.isdigit() or len(postal_code) != 5):
        raise HTTPException(400, "Code postal invalide")
    try:
        points = await asyncio.to_thread(_mr_search_points, "FR", postal_code, city)
    except Exception as e:
        logger.error(f"mondial-relay search error: {type(e).__name__}")
        raise HTTPException(502, "Le service Mondial Relay est momentanément indisponible. Réessayez dans un instant.")
    return {"points": points}

@api.get("/admin/mondial-relay/status")
async def mondial_relay_status(admin: dict = Depends(get_current_admin)):
    return {"api1_configured": mr_api1_configured(), "api2_configured": mr_api2_configured()}

class ShippingUpdate(BaseModel):
    shipping_status: Optional[str] = None
    tracking_number: Optional[str] = None

@api.put("/admin/orders/{session_id}/shipping")
async def update_order_shipping(session_id: str, body: ShippingUpdate,
                                admin: dict = Depends(get_current_admin)):
    """STATUT DE LIVRAISON détaillé. Synchronise l'état COMMANDE selon SHIP_TO_ORDER
    (jamais de retour arrière, sauf incident/annulée explicites)."""
    if body.shipping_status is not None and body.shipping_status not in SHIPPING_STATUSES:
        raise HTTPException(400, "Statut d'expédition invalide")
    order = await db.payment_transactions.find_one({"session_id": session_id})
    if not order:
        raise HTTPException(404, "Commande introuvable")
    now = datetime.now(timezone.utc)
    updates = {"updated_at": now}
    email_sent = False
    if body.shipping_status is not None:
        updates["shipping_status"] = body.shipping_status
        if body.shipping_status == "expediee":
            updates["shipped_at"] = now
        target = SHIP_TO_ORDER.get(body.shipping_status)
        if target:
            cur_order = order.get("fulfillment_status") or "a_traiter"
            if (body.shipping_status in SHIP_FORCE
                    or ORDER_RANK[target] > ORDER_RANK.get(cur_order, 0)):
                updates["fulfillment_status"] = target
    if body.tracking_number is not None:
        updates["tracking_number"] = body.tracking_number.strip()
    if len(updates) == 1:
        raise HTTPException(400, "Aucune donnée")
    await db.payment_transactions.update_one({"session_id": session_id}, {"$set": updates})
    if updates.get("fulfillment_status") == "expediee" and order.get("fulfillment_status") != "expediee":
        try:
            email_sent = await _maybe_send_shipping_email(session_id)
        except Exception as e:
            logging.getLogger(__name__).error(f"shipping email error: {e}")
    for k, v in updates.items():
        if isinstance(v, datetime):
            updates[k] = v.isoformat()
    return {"ok": True, "email_sent": email_sent, **updates}

@api.post("/admin/orders/{session_id}/create-shipment")
async def create_shipment(session_id: str, admin: dict = Depends(get_current_admin)):
    """Préparé pour l'API2 Mondial Relay (expédition + étiquette).
    Actif uniquement lorsque les identifiants marchands API2 sont configurés."""
    if not mr_api2_configured():
        raise HTTPException(503, "MONDIAL_RELAY_NOT_CONFIGURED")
    raise HTTPException(501, "Création d'expédition non encore activée")

# ===== SEO : sitemap dynamique =====
@api.get("/health")
async def api_health():
    return {"status": "ok"}

# Domaine public canonique : utilisé pour le fichier sitemap.xml statique servi
# par le frontend à la racine du domaine (l'infra ne route que /api/* vers ce
# backend, donc /sitemap.xml est un fichier statique régénéré ici).
PUBLIC_SITE_DOMAIN = "https://moulincomics.com"

async def build_sitemap_xml(base: str) -> str:
    """XML du sitemap : pages publiques + toutes les fiches produits (slugs)."""
    base = base.rstrip("/")
    parts = []
    for pth in ("/", "/shop", "/conventions", "/contact", "/mentions-legales", "/cgv", "/politique-livraison"):
        parts.append(f"<url><loc>{base}{pth}</loc><changefreq>weekly</changefreq></url>")
    prods = await db.products.find({}, {"created_at": 1, "slug": 1}).sort("created_at", -1).to_list(5000)
    for p in prods:
        ca = p.get("created_at")
        lastmod = ""
        if isinstance(ca, datetime):
            lastmod = f"<lastmod>{ca.date().isoformat()}</lastmod>"
        elif isinstance(ca, str) and ca[:10]:
            lastmod = f"<lastmod>{ca[:10]}</lastmod>"
        parts.append(f"<url><loc>{base}/product/{p.get('slug') or p['_id']}</loc>{lastmod}<changefreq>weekly</changefreq></url>")
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            + "".join(parts) + "</urlset>")

@api.get("/sitemap.xml")
async def sitemap_xml():
    """Sitemap dynamique temps réel. Le domaine vient de SITE_URL (backend/.env)."""
    return Response(content=await build_sitemap_xml(os.environ["SITE_URL"]),
                    media_type="application/xml")

async def write_sitemap_file():
    """Régénère le sitemap.xml statique (domaine public canonique) servi à la
    racine : https://moulincomics.com/sitemap.xml. Écrit dans public/ (embarqué
    dans chaque build de déploiement) et dans build/ si présent (rafraîchit le
    déploiement en cours sans rebuild)."""
    try:
        xml = await build_sitemap_xml(PUBLIC_SITE_DOMAIN)
        frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
        targets = [frontend_dir / "public" / "sitemap.xml"]
        build_dir = frontend_dir / "build"
        if build_dir.is_dir():
            targets.append(build_dir / "sitemap.xml")
        for target in targets:
            if target.exists() and target.read_text(encoding="utf-8") == xml:
                continue  # inchangé : évite une écriture (et un reload dev-server)
            target.write_text(xml, encoding="utf-8")
        logger.info("Sitemap statique régénéré")
    except Exception as e:
        logger.error(f"Sitemap statique non régénéré: {e}")

async def _sitemap_file_refresher():
    while True:
        await asyncio.sleep(600)
        await write_sitemap_file()

app.include_router(api)

@app.get("/health")
async def health():
    """Sonde de santé Kubernetes — légère, sans dépendance à la base."""
    return {"status": "ok"}

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def seed_admin():
    email = os.environ["ADMIN_EMAIL"].strip().lower()
    pwd = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": email})
    if existing is None:
        await db.users.insert_one({"email": email, "password_hash": hash_password(pwd),
                                   "name": "Admin", "role": "admin",
                                   "created_at": datetime.now(timezone.utc)})
        logger.info("Admin seeded")
    elif not verify_password(pwd, existing["password_hash"]):
        await db.users.update_one({"email": email},
                                  {"$set": {"password_hash": hash_password(pwd)}})

async def seed_products():
    if await db.products.count_documents({}) > 0:
        return
    from seed_data import PRODUCTS
    for p in PRODUCTS:
        doc = Product(**p).model_dump(by_alias=True, exclude={"id"})
        doc["created_at"] = doc["created_at"].isoformat()
        await db.products.insert_one(doc)
    logger.info("Products seeded")

async def seed_series():
    existing = await db.series_list.count_documents({})
    if existing > 0:
        return
    names = [v for v in await db.products.distinct("series") if v]
    for n in sorted(names):
        await db.series_list.insert_one({"name": n, "created_at": datetime.now(timezone.utc).isoformat()})
    logger.info("Series seeded")

async def seed_salons():
    if await db.salons.count_documents({}) > 0:
        return
    salons = [
        {"date_label": "24–27 JAN 2026", "city": "Angoulême", "country": "France", "name": "Festival International de la BD", "note": "Stand VO & fonds Lug"},
        {"date_label": "14–15 MAR 2026", "city": "Paris", "country": "France", "name": "Comic Con Paris", "note": "Nouveautés VO Marvel / DC"},
        {"date_label": "18–19 AVR 2026", "city": "Bruxelles", "country": "Belgique", "name": "Brussels Comic Con", "note": "Strange, Nova, Titans"},
        {"date_label": "30 OCT–3 NOV 2026", "city": "Lucca", "country": "Italie", "name": "Lucca Comics & Games", "note": "Sélection collector VO"},
    ]
    for s in salons:
        s["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.salons.insert_one(s)
    logger.info("Salons seeded")

async def seed_categories():
    """Initialisation UNIQUE de la liste des catégories produits : ne s'exécute
    que si la clé « categories » est absente de site_content. Les modifications
    admin ultérieures (ajouts, renommages, suppressions) ne sont jamais écrasées."""
    doc = await db.site_content.find_one({"key": "home"}, {"categories": 1})
    if not doc or "categories" not in doc:
        await db.site_content.update_one(
            {"key": "home"},
            {"$set": {"categories": PRODUCT_CATEGORIES_DEFAULT}},
            upsert=True)
        logger.info("Catégories produits initialisées (8 valeurs)")

async def seed_faq():
    """Initialisation UNIQUE de la FAQ : ne s'exécute que si la section « faq »
    est absente du document site_content. Les modifications ultérieures faites
    dans l'admin (y compris la suppression de toutes les questions) ne sont
    jamais écrasées : la clé existe dès le premier seed."""
    doc = await db.site_content.find_one({"key": "home"}, {"faq": 1})
    if not doc or "faq" not in doc:
        await db.site_content.update_one(
            {"key": "home"},
            {"$set": {"faq": {"items": DEFAULT_FAQ_ITEMS}}},
            upsert=True)
        logger.info("FAQ initialisée (19 questions FR/EN/ES)")

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.products.create_index("category")
    await db.products.create_index("series")
    await db.products.create_index("created_at")
    await db.products.create_index("slug")
    await db.products.create_index("old_slugs")
    await seed_admin()
    await seed_products()
    await seed_series()
    await seed_salons()
    await seed_faq()
    await seed_categories()
    await _ensure_product_slugs()
    # Migration idempotente : ancien vocabulaire « Traitement » → nouvel état COMMANDE
    await db.payment_transactions.update_many(
        {"fulfillment_status": "en_attente"}, {"$set": {"fulfillment_status": "a_traiter"}})
    await db.payment_transactions.update_many(
        {"fulfillment_status": "en_preparation"}, {"$set": {"fulfillment_status": "a_traiter"}})
    await db.payment_transactions.update_many(
        {"fulfillment_status": "livree"}, {"$set": {"fulfillment_status": "terminee"}})
    await db.payment_transactions.update_many(
        {"fulfillment_status": {"$exists": False}}, {"$set": {"fulfillment_status": "a_traiter"}})
    await db.payment_transactions.update_many(
        {"shipping_status": {"$exists": False}}, {"$set": {"shipping_status": "a_preparer"}})
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    # Sitemap statique (servi à /sitemap.xml sur le domaine public) :
    # généré au démarrage puis rafraîchi toutes les 10 min.
    await write_sitemap_file()
    asyncio.create_task(_sitemap_file_refresher())

@app.on_event("shutdown")
async def shutdown():
    client.close()
