from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import logging
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
    series: Optional[str] = ""          # Strange, Nova, Titans, or serie VO
    publisher: Optional[str] = ""       # Marvel, DC, Lug/Semic...
    category: str = "VO"                # "VO" or "VF"
    price: float
    stock: int = 1
    condition: str = "Très bon état"
    year: Optional[str] = ""
    issue: Optional[str] = ""           # numero
    description: Optional[str] = ""
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
    series: Optional[str] = ""
    publisher: Optional[str] = ""
    category: str = "VO"
    price: float
    stock: int = 1
    condition: str = "Très bon état"
    year: Optional[str] = ""
    issue: Optional[str] = ""
    description: Optional[str] = ""
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
    vals = await db.products.distinct("series")
    return [v for v in vals if v]

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

@api.get("/admin/orders")
async def list_orders(admin: dict = Depends(get_current_admin)):
    docs = await db.payment_transactions.find().sort("created_at", -1).to_list(500)
    out = []
    for d in docs:
        d.pop("_id", None)
        if isinstance(d.get("created_at"), datetime):
            d["created_at"] = d["created_at"].isoformat()
        if isinstance(d.get("updated_at"), datetime):
            d["updated_at"] = d["updated_at"].isoformat()
        out.append(d)
    return out

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

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await seed_admin()
    await seed_products()

@app.on_event("shutdown")
async def shutdown():
    client.close()
