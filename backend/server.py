from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Form
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
    cover_image: str = ""
    featured: bool = False

class LoginRequest(BaseModel):
    email: str
    password: str

class CartItem(BaseModel):
    product_id: str
    quantity: int = Field(1, ge=1, le=99)

class CheckoutRequest(BaseModel):
    items: List[CartItem]
    origin_url: str

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
    docs = await db.products.find(query).sort("created_at", -1).to_list(500)
    return [serialize(d) for d in docs]

@api.get("/products/{product_id}")
async def get_product(product_id: str):
    doc = await db.products.find_one({"_id": ObjectId(product_id)})
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

# ----- Salons (conventions) -----
class SalonBody(BaseModel):
    date_label: str = ""
    city: str = ""
    country: str = ""
    name: str = ""
    note: str = ""

def _salon_out(d: dict) -> dict:
    return {"id": str(d["_id"]), "date_label": d.get("date_label", ""), "city": d.get("city", ""),
            "country": d.get("country", ""), "name": d.get("name", ""), "note": d.get("note", "")}

@api.get("/salons")
async def list_salons():
    docs = await db.salons.find().sort("created_at", 1).to_list(500)
    return [_salon_out(d) for d in docs]

@api.post("/admin/salons")
async def create_salon(body: SalonBody, admin: dict = Depends(get_current_admin)):
    doc = body.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.salons.insert_one(doc)
    return _salon_out(await db.salons.find_one({"_id": res.inserted_id}))

@api.put("/admin/salons/{salon_id}")
async def update_salon(salon_id: str, body: SalonBody, admin: dict = Depends(get_current_admin)):
    await db.salons.update_one({"_id": ObjectId(salon_id)}, {"$set": body.model_dump()})
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
    res = await db.products.insert_one(doc)
    new = await db.products.find_one({"_id": res.inserted_id})
    return serialize(new)

@api.put("/admin/products/{product_id}")
async def update_product(product_id: str, body: ProductCreate, admin: dict = Depends(get_current_admin)):
    await db.products.update_one({"_id": ObjectId(product_id)}, {"$set": body.model_dump()})
    doc = await db.products.find_one({"_id": ObjectId(product_id)})
    if not doc:
        raise HTTPException(404, "Produit introuvable")
    return serialize(doc)

@api.delete("/admin/products/{product_id}")
async def delete_product(product_id: str, admin: dict = Depends(get_current_admin)):
    await db.products.delete_one({"_id": ObjectId(product_id)})
    return {"ok": True}

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
    b64 = base64.b64encode(store_bytes).decode()
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

@api.get("/admin/orders")
async def list_orders(admin: dict = Depends(get_current_admin)):
    docs = await db.payment_transactions.find().sort("created_at", -1).to_list(500)
    out = []
    for d in docs:
        d.pop("_id", None)
        d.setdefault("fulfillment_status", "en_attente")
        if isinstance(d.get("created_at"), datetime):
            d["created_at"] = d["created_at"].isoformat()
        if isinstance(d.get("updated_at"), datetime):
            d["updated_at"] = d["updated_at"].isoformat()
        out.append(d)
    return out

class FulfillmentUpdate(BaseModel):
    fulfillment_status: str

@api.put("/admin/orders/{session_id}/status")
async def update_order_status(session_id: str, body: FulfillmentUpdate,
                              admin: dict = Depends(get_current_admin)):
    if body.fulfillment_status not in {"en_attente", "expediee", "livree"}:
        raise HTTPException(400, "Statut invalide")
    res = await db.payment_transactions.update_one(
        {"session_id": session_id},
        {"$set": {"fulfillment_status": body.fulfillment_status,
                  "updated_at": datetime.now(timezone.utc)}})
    if res.matched_count == 0:
        raise HTTPException(404, "Commande introuvable")
    return {"ok": True, "fulfillment_status": body.fulfillment_status}

# ----- Payments (Stripe) -----
@api.post("/payments/checkout")
async def create_checkout(req: CheckoutRequest):
    if not req.items:
        raise HTTPException(400, "Panier vide")
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

    kwargs = dict(
        line_items=line_items,
        mode="payment",
        shipping_address_collection={"allowed_countries": ["FR", "BE", "CH", "LU", "DE", "ES", "IT", "GB", "NL"]},
        success_url=f"{req.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{req.origin_url}/payment/cancel",
    )
    try:
        session = stripe.checkout.Session.create(
            **kwargs, automatic_tax={"enabled": True}, billing_address_collection="required")
    except stripe.error.StripeError:
        session = stripe.checkout.Session.create(**kwargs)

    await db.payment_transactions.insert_one({
        "session_id": session.id, "items": summary, "amount": total, "currency": "eur",
        "status": "initiated", "payment_status": "pending",
        "fulfillment_status": "en_attente",
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
            if s.payment_status == "paid" or s.status == "complete":
                await db.payment_transactions.update_one(
                    {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {"$set": {"status": "completed", "payment_status": "paid",
                              "updated_at": datetime.now(timezone.utc)}})
                await _decrement_stock(session_id)
                record = await db.payment_transactions.find_one({"session_id": session_id})
        except stripe.error.StripeError:
            pass
    return {"session_id": record["session_id"], "status": record["status"],
            "payment_status": record["payment_status"], "amount": record.get("amount"),
            "items": record.get("items", [])}

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
        await _decrement_stock(obj["id"])
    return {"status": "ok"}

app.include_router(api)

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

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await seed_admin()
    await seed_products()
    await seed_series()
    await seed_salons()
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")

@app.on_event("shutdown")
async def shutdown():
    client.close()
