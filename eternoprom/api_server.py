"""
api_server.py — Единый ресурс металла Backend
====================================
FastAPI + SQLite. Принимает заявки с сайта, шлёт email через Яндекс SMTP.

Запуск:
  pip install fastapi uvicorn[standard] aiosmtplib python-jose[cryptography]
  python api_server.py

Порт: 8000
CORS: разрешён для всех (настроить под домен в production!)

Конфиг: api_config.json (создаётся при первом запуске)
  {
    "admin_user": "admin",
    "admin_password_hash": "...",   <- bcrypt hash
    "email_to": "sales@erm-group.ru",
    "smtp_user": "login@yandex.ru",
    "smtp_pass": "app-password",
    "notify": "all"                 <- all | orders | important
  }
"""

import json
import hashlib
import hmac
import os
import sqlite3
import smtplib
import ssl
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from typing import Optional, List
import re
from html import unescape
import secrets

try:
    from fastapi import FastAPI, HTTPException, Depends, status
    from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    import uvicorn
except ImportError:
    print("Установите зависимости: pip install fastapi uvicorn[standard]")
    exit(1)

# ─── Config ───────────────────────────────────────────────────────────────────

CONFIG_FILE = Path(__file__).parent / "api_config.json"
DB_FILE = Path(__file__).parent / "epm_crm.db"
SECRET_KEY = "epm-secret-change-in-production-" + secrets.token_hex(8)

DEFAULT_CONFIG = {
    "admin_user": "admin",
    "admin_password": "admin123",   # plain text — при старте хешируется
    "email_to": "sales@erm-group.ru",
    "smtp_user": "",
    "smtp_pass": "",
    "notify": "all"
}

def load_config():
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE) as f:
            return {**DEFAULT_CONFIG, **json.load(f)}
    return DEFAULT_CONFIG.copy()

def save_config(cfg):
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)

CONFIG = load_config()


CATALOG_ROOT = Path(__file__).parent / "catalog"

def slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9а-яё]+", "-", value, flags=re.IGNORECASE)
    return value.strip("-") or "item"

def extract_html_title(path: Path) -> str:
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        return path.parent.name.replace("-", " ").title()
    for pattern in [r"<h1[^>]*>(.*?)</h1>", r"<title>(.*?)</title>"]:
        m = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
        if m:
            raw = re.sub(r"<[^>]+>", "", m.group(1))
            raw = unescape(raw).replace("| Единый ресурс металла", "").replace("— ЕРМ", "").strip()
            raw = re.sub(r"\s+в Москве$", "", raw).strip()
            if raw:
                return raw
    return path.parent.name.replace("-", " ").title()

def extract_service_sections() -> list[dict]:
    services_path = Path(__file__).parent / "services.html"
    if not services_path.exists():
        return []
    text = services_path.read_text(encoding="utf-8")
    sections = []
    for sec in re.finditer(r'<div class="services-cat-section" id="([^"]+)">(.+?)</div>\s*</div>', text, re.S):
        slug, body = sec.group(1), sec.group(2)
        title_match = re.search(r'<h2 class="services-cat-title">(.*?)</h2>', body, re.S)
        title = unescape(re.sub(r'<[^>]+>', '', title_match.group(1))).strip() if title_match else slug
        items = [unescape(re.sub(r'<[^>]+>', '', m)).strip() for m in re.findall(r'<a class="service-list-item"[^>]*>(.*?)</a>', body, re.S)]
        items = [re.sub(r'^\s*', '', re.sub(r'\s+', ' ', i)).strip() for i in items]
        sections.append({"slug": slug, "title": title, "items": [i for i in items if i]})
    return sections

def seed_catalog_data(conn):
    if conn.execute("SELECT COUNT(*) FROM catalog_entities").fetchone()[0] > 0:
        return
    if not CATALOG_ROOT.exists():
        return
    category_dirs = sorted([p for p in CATALOG_ROOT.iterdir() if p.is_dir()])
    position = 0
    for category_dir in category_dirs:
        category_index = category_dir / 'index.html'
        category_name = extract_html_title(category_index) if category_index.exists() else category_dir.name
        category_url = f"/catalog/{category_dir.name}/"
        cur = conn.execute("INSERT INTO catalog_entities (entity_type, parent_id, name, slug, url, description, sort_order, is_seeded) VALUES ('category', NULL, ?, ?, ?, ?, ?, 1)", (category_name, category_dir.name, category_url, '', position))
        category_id = cur.lastrowid
        position += 1
        sub_position = 0
        for sub_dir in sorted([p for p in category_dir.iterdir() if p.is_dir()]):
            sub_index = sub_dir / 'index.html'
            if not sub_index.exists():
                continue
            sub_name = extract_html_title(sub_index)
            sub_url = f"/catalog/{category_dir.name}/{sub_dir.name}/"
            sub_cur = conn.execute("INSERT INTO catalog_entities (entity_type, parent_id, name, slug, url, description, sort_order, is_seeded) VALUES ('subcategory', ?, ?, ?, ?, ?, ?, 1)", (category_id, sub_name, sub_dir.name, sub_url, '', sub_position))
            sub_id = sub_cur.lastrowid
            sub_position += 1
            prod_position = 0
            for product_dir in sorted([p for p in sub_dir.iterdir() if p.is_dir()]):
                product_index = product_dir / 'index.html'
                if not product_index.exists():
                    continue
                product_name = extract_html_title(product_index)
                product_url = f"/catalog/{category_dir.name}/{sub_dir.name}/{product_dir.name}/"
                conn.execute("INSERT INTO catalog_entities (entity_type, parent_id, name, slug, url, description, sort_order, is_seeded) VALUES ('product', ?, ?, ?, ?, ?, ?, 1)", (sub_id, product_name, product_dir.name, product_url, '', prod_position))
                prod_position += 1

def seed_service_data(conn):
    if conn.execute("SELECT COUNT(*) FROM service_groups").fetchone()[0] > 0:
        return
    for idx, section in enumerate(extract_service_sections()):
        cur = conn.execute("INSERT INTO service_groups (title, slug, sort_order, is_seeded) VALUES (?, ?, ?, 1)", (section['title'], section['slug'], idx))
        group_id = cur.lastrowid
        for item_idx, item in enumerate(section['items']):
            conn.execute("INSERT INTO service_items (group_id, title, sort_order, is_seeded) VALUES (?, ?, ?, 1)", (group_id, item, item_idx))

def build_catalog_payload(conn):
    rows = conn.execute("SELECT * FROM catalog_entities WHERE is_active=1 ORDER BY entity_type, sort_order, id").fetchall()
    entities = [dict(r) for r in rows]
    by_parent = {}
    for entity in entities:
        by_parent.setdefault(entity['parent_id'], []).append(entity)
    for items in by_parent.values():
        items.sort(key=lambda e: (e.get('sort_order') or 0, e['name'].lower()))
    categories = []
    for cat in by_parent.get(None, []):
        if cat['entity_type'] != 'category':
            continue
        subcategories = []
        for sub in by_parent.get(cat['id'], []):
            if sub['entity_type'] != 'subcategory':
                continue
            products = [p for p in by_parent.get(sub['id'], []) if p['entity_type'] == 'product']
            subcategories.append({**sub, 'products': products, 'product_count': len(products)})
        categories.append({**cat, 'subcategories': subcategories, 'subcategory_count': len(subcategories)})
    groups = []
    for group in conn.execute("SELECT * FROM service_groups WHERE is_active=1 ORDER BY sort_order, id").fetchall():
        g = dict(group)
        items = [dict(r) for r in conn.execute("SELECT * FROM service_items WHERE group_id=? AND is_active=1 ORDER BY sort_order, id", (g['id'],)).fetchall()]
        g['items'] = items
        groups.append(g)
    return {"categories": categories, "service_groups": groups}


# ─── Database ─────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            name TEXT,
            company TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            comment TEXT,
            product TEXT,
            page_url TEXT,
            items TEXT,
            total REAL,
            status TEXT DEFAULT 'new',
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS catalog_entities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            parent_id INTEGER,
            name TEXT NOT NULL,
            slug TEXT NOT NULL,
            url TEXT NOT NULL,
            image TEXT DEFAULT '',
            description TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            is_seeded INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS service_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            slug TEXT NOT NULL,
            description TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            is_seeded INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS service_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            is_seeded INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    seed_catalog_data(conn)
    seed_service_data(conn)
    conn.commit()
    conn.close()

init_db()

# ─── Auth ──────────────────────────────────────────────────────────────────────

def simple_hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(plain: str, stored: str) -> bool:
    return simple_hash(plain) == stored

def create_token(username: str) -> str:
    payload = f"{username}:{datetime.utcnow().isoformat()}"
    return hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest() + ":" + payload

def verify_token(token: str) -> bool:
    try:
        sig, payload = token.split(":", 1)
        expected = hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return False
        # Токен живёт 24 часа
        ts_str = payload.split(":", 1)[1] if ":" in payload else payload
        ts = datetime.fromisoformat(ts_str)
        return datetime.utcnow() - ts < timedelta(hours=24)
    except Exception:
        return False

# ─── Email ────────────────────────────────────────────────────────────────────

def send_email(subject: str, body_html: str):
    cfg = load_config()
    smtp_user = cfg.get("smtp_user", "")
    smtp_pass = cfg.get("smtp_pass", "")
    email_to = cfg.get("email_to", "")
    
    if not smtp_user or not smtp_pass or not email_to:
        print(f"[EMAIL SKIP] SMTP не настроен. Тема: {subject}")
        return False
    
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_user
        msg["To"] = email_to
        msg.attach(MIMEText(body_html, "html", "utf-8"))
        
        # Яндекс SMTP
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL("smtp.yandex.ru", 465, context=context) as server:
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, email_to, msg.as_string())
        print(f"[EMAIL OK] Отправлено: {subject}")
        return True
    except Exception as e:
        print(f"[EMAIL ERROR] {e}")
        return False

def email_order(entry: dict):
    items_rows = ""
    for item in (entry.get("items") or []):
        title = item.get("title","—")
        qty = item.get("qty", 1)
        price = item.get("priceNum", 0)
        subtotal = price * qty
        items_rows += f"<tr><td style='padding:6px 10px;border-bottom:1px solid #eee;'>{title}</td><td style='padding:6px 10px;border-bottom:1px solid #eee;text-align:center;'>{qty}</td><td style='padding:6px 10px;border-bottom:1px solid #eee;text-align:right;'>{subtotal:,.0f} ₽</td></tr>"
    
    total = entry.get("total", 0)
    body = f"""<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
<div style="background:#001952;padding:16px 24px;border-radius:8px 8px 0 0;">
  <h2 style="color:#fff;margin:0;font-size:18px;">Новый заказ #{entry['id']} — Единый ресурс металла</h2>
</div>
<div style="background:#fff;border:1px solid #e8ecf4;border-top:none;border-radius:0 0 8px 8px;padding:20px 24px;">
  <table width="100%" style="font-size:13px;margin-bottom:16px;"><tr><td style="color:#8a96ae;width:140px;">Клиент:</td><td><strong>{entry.get('name','—')}</strong></td></tr>
  <tr><td style="color:#8a96ae;">Компания:</td><td>{entry.get('company','—')}</td></tr>
  <tr><td style="color:#8a96ae;">Телефон:</td><td><a href="tel:{entry.get('phone','')}">{entry.get('phone','—')}</a></td></tr>
  <tr><td style="color:#8a96ae;">Email:</td><td>{entry.get('email','—')}</td></tr>
  <tr><td style="color:#8a96ae;">Адрес:</td><td>{entry.get('address','—')}</td></tr>
  <tr><td style="color:#8a96ae;">Комментарий:</td><td>{entry.get('comment','—')}</td></tr>
  </table>
  <table width="100%" style="border-collapse:collapse;font-size:13px;">
    <thead><tr style="background:#f5f7fa;"><th style="padding:8px 10px;text-align:left;">Товар</th><th style="padding:8px 10px;text-align:center;">Кол.</th><th style="padding:8px 10px;text-align:right;">Сумма</th></tr></thead>
    <tbody>{items_rows}</tbody>
  </table>
  <div style="text-align:right;font-size:15px;font-weight:700;color:#001952;margin-top:10px;">Итого: {f"{total:,.0f} ₽" if total else "По запросу"}</div>
  <div style="margin-top:20px;padding:12px;background:#f5f7fa;border-radius:8px;font-size:12px;color:#8a96ae;">Дата: {entry.get('created_at','')}</div>
</div></div>"""
    send_email(f"[Единый ресурс металла] Новый заказ #{entry['id']} от {entry.get('name','Клиент')}", body)

def email_lead(entry: dict):
    body = f"""<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
<div style="background:#8B1A1A;padding:14px 20px;border-radius:8px 8px 0 0;"><h2 style="color:#fff;margin:0;font-size:16px;">Запрос цены #{entry['id']} — Единый ресурс металла</h2></div>
<div style="background:#fff;border:1px solid #e8ecf4;border-top:none;border-radius:0 0 8px 8px;padding:18px 20px;">
  <table style="font-size:13px;" width="100%">
  <tr><td style="color:#8a96ae;width:100px;padding:4px 0;">Телефон:</td><td><strong><a href="tel:{entry.get('phone','')}">{entry.get('phone','—')}</a></strong></td></tr>
  <tr><td style="color:#8a96ae;padding:4px 0;">Товар:</td><td><strong>{entry.get('product','—')}</strong></td></tr>
  <tr><td style="color:#8a96ae;padding:4px 0;">Страница:</td><td><a href="{entry.get('page_url','')}">{entry.get('page_url','—')}</a></td></tr>
  <tr><td style="color:#8a96ae;padding:4px 0;">Дата:</td><td>{entry.get('created_at','')}</td></tr>
  </table>
</div></div>"""
    send_email(f"[Единый ресурс металла] Запрос цены: {entry.get('product','товар')}", body)

def email_callback(entry: dict):
    body = f"""<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
<div style="background:#22c55e;padding:14px 20px;border-radius:8px 8px 0 0;"><h2 style="color:#fff;margin:0;font-size:16px;">Заказ звонка #{entry['id']} — Единый ресурс металла</h2></div>
<div style="background:#fff;border:1px solid #e8ecf4;border-top:none;border-radius:0 0 8px 8px;padding:18px 20px;">
  <table style="font-size:13px;" width="100%">
  <tr><td style="color:#8a96ae;width:100px;padding:4px 0;">Имя:</td><td><strong>{entry.get('name','—')}</strong></td></tr>
  <tr><td style="color:#8a96ae;padding:4px 0;">Телефон:</td><td><strong><a href="tel:{entry.get('phone','')}">{entry.get('phone','—')}</a></strong></td></tr>
  <tr><td style="color:#8a96ae;padding:4px 0;">Комментарий:</td><td>{entry.get('comment','—')}</td></tr>
  <tr><td style="color:#8a96ae;padding:4px 0;">Дата:</td><td>{entry.get('created_at','')}</td></tr>
  </table>
</div></div>"""
    send_email(f"[Единый ресурс металла] Заказ звонка от {entry.get('name','Клиента')}: {entry.get('phone','')}", body)

# ─── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(title="Единый ресурс металла CRM API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # В production замените на ваш домен
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer(auto_error=False)

def get_token(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    if not credentials or not verify_token(credentials.credentials):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return credentials.credentials

# ─── Models ───────────────────────────────────────────────────────────────────

class OrderItem(BaseModel):
    sku: Optional[str] = None
    title: Optional[str] = None
    qty: int = 1
    priceNum: float = 0
    image: Optional[str] = None
    variant: Optional[str] = None

class OrderRequest(BaseModel):
    type: str = "order"
    name: str
    company: Optional[str] = None
    phone: str
    email: Optional[str] = None
    address: Optional[str] = None
    comment: Optional[str] = None
    items: List[OrderItem] = []
    total: float = 0
    page_url: Optional[str] = None

class LeadRequest(BaseModel):
    type: str = "price_request"
    phone: str
    product: Optional[str] = None
    page_url: Optional[str] = None

class CallbackRequest(BaseModel):
    type: str = "callback"
    name: Optional[str] = None
    phone: str
    comment: Optional[str] = None

class StatusUpdate(BaseModel):
    status: str

class AuthRequest(BaseModel):
    username: str
    password: str

class SettingsRequest(BaseModel):
    email: Optional[str] = None
    smtp_user: Optional[str] = None
    smtp_pass: Optional[str] = None
    notify: Optional[str] = None

class PasswordChange(BaseModel):
    password: str

class CatalogEntityRequest(BaseModel):
    entity_type: str
    parent_id: Optional[int] = None
    name: str
    slug: Optional[str] = None
    url: Optional[str] = None
    image: Optional[str] = ''
    description: Optional[str] = ''
    sort_order: int = 0
    is_active: bool = True

class ServiceGroupRequest(BaseModel):
    title: str
    slug: Optional[str] = None
    description: Optional[str] = ''
    sort_order: int = 0
    is_active: bool = True

class ServiceItemRequest(BaseModel):
    title: str
    sort_order: int = 0
    is_active: bool = True

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "ok", "service": "Единый ресурс металла CRM API"}

@app.get("/health")
def health():
    return {"status": "healthy"}

@app.post("/api/auth")
def auth(req: AuthRequest):
    cfg = load_config()
    stored = cfg.get("admin_password", "")
    if req.username == cfg.get("admin_user") and (req.password == stored or verify_password(req.password, stored)):
        token = create_token(req.username)
        return {"token": token, "expires_in": 86400}
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.post("/api/order", status_code=201)
def create_order(req: OrderRequest):
    conn = get_db()
    items_json = json.dumps([i.dict() for i in req.items], ensure_ascii=False)
    cur = conn.execute("""
        INSERT INTO entries (type, name, company, phone, email, address, comment, items, total, page_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (req.type, req.name, req.company, req.phone, req.email, req.address, req.comment, items_json, req.total, req.page_url))
    conn.commit()
    entry_id = cur.lastrowid
    entry = dict(conn.execute("SELECT * FROM entries WHERE id=?", (entry_id,)).fetchone())
    conn.close()
    entry["items"] = json.loads(entry.get("items") or "[]")
    
    cfg = load_config()
    if cfg.get("notify") in ("all", "orders", "important"):
        try: email_order(entry)
        except Exception as e: print(f"Email error: {e}")
    
    return {"id": entry_id, "status": "created"}

@app.post("/api/lead", status_code=201)
def create_lead(req: LeadRequest):
    conn = get_db()
    cur = conn.execute("""
        INSERT INTO entries (type, phone, product, page_url)
        VALUES (?, ?, ?, ?)
    """, (req.type, req.phone, req.product, req.page_url))
    conn.commit()
    entry_id = cur.lastrowid
    entry = dict(conn.execute("SELECT * FROM entries WHERE id=?", (entry_id,)).fetchone())
    conn.close()
    
    cfg = load_config()
    if cfg.get("notify") in ("all", "important"):
        try: email_lead(entry)
        except Exception as e: print(f"Email error: {e}")
    
    return {"id": entry_id, "status": "created"}

@app.post("/api/callback", status_code=201)
def create_callback(req: CallbackRequest):
    conn = get_db()
    cur = conn.execute("""
        INSERT INTO entries (type, name, phone, comment)
        VALUES (?, ?, ?, ?)
    """, (req.type, req.name, req.phone, req.comment))
    conn.commit()
    entry_id = cur.lastrowid
    entry = dict(conn.execute("SELECT * FROM entries WHERE id=?", (entry_id,)).fetchone())
    conn.close()
    
    cfg = load_config()
    if cfg.get("notify") == "all":
        try: email_callback(entry)
        except Exception as e: print(f"Email error: {e}")
    
    return {"id": entry_id, "status": "created"}

@app.get("/api/entries")
def get_entries(token=Depends(get_token)):
    conn = get_db()
    rows = conn.execute("SELECT * FROM entries ORDER BY created_at DESC").fetchall()
    conn.close()
    result = []
    for row in rows:
        e = dict(row)
        e["items"] = json.loads(e.get("items") or "[]")
        result.append(e)
    return result

@app.patch("/api/entries/{entry_id}/status")
def update_entry_status(entry_id: int, req: StatusUpdate, token=Depends(get_token)):
    conn = get_db()
    conn.execute("UPDATE entries SET status=? WHERE id=?", (req.status, entry_id))
    conn.commit()
    conn.close()
    return {"id": entry_id, "status": req.status}

@app.post("/api/settings")
def update_settings(req: SettingsRequest, token=Depends(get_token)):
    cfg = load_config()
    if req.email: cfg["email_to"] = req.email
    if req.smtp_user: cfg["smtp_user"] = req.smtp_user
    if req.smtp_pass: cfg["smtp_pass"] = req.smtp_pass
    if req.notify: cfg["notify"] = req.notify
    save_config(cfg)
    return {"status": "saved"}

@app.post("/api/test-email")
def test_email_route(token=Depends(get_token)):
    result = send_email(
        "[Единый ресурс металла] Тестовое письмо",
        "<p>Если вы получили это письмо — SMTP настроен корректно.</p><p>Система CRM Единый ресурс металла работает.</p>"
    )
    if result:
        return {"status": "sent"}
    raise HTTPException(status_code=500, detail="SMTP not configured or send failed")

@app.post("/api/change-password")
def change_password(req: PasswordChange, token=Depends(get_token)):
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password too short")
    cfg = load_config()
    cfg["admin_password"] = simple_hash(req.password)
    save_config(cfg)
    return {"status": "changed"}

@app.get("/api/catalog-structure")
def get_catalog_structure():
    conn = get_db()
    payload = build_catalog_payload(conn)
    conn.close()
    return payload

@app.get("/api/admin/catalog")
def get_admin_catalog(token=Depends(get_token)):
    conn = get_db()
    payload = build_catalog_payload(conn)
    conn.close()
    return payload

@app.post("/api/admin/catalog/entities")
def create_catalog_entity(req: CatalogEntityRequest, token=Depends(get_token)):
    entity_type = req.entity_type.strip()
    if entity_type not in {"category", "subcategory", "product"}:
        raise HTTPException(status_code=400, detail="Invalid entity type")
    parent_id = req.parent_id
    conn = get_db()
    if entity_type == 'subcategory':
        parent = conn.execute("SELECT entity_type FROM catalog_entities WHERE id=?", (parent_id,)).fetchone()
        if not parent or parent['entity_type'] != 'category':
            raise HTTPException(status_code=400, detail='Subcategory must belong to category')
    if entity_type == 'product':
        parent = conn.execute("SELECT entity_type FROM catalog_entities WHERE id=?", (parent_id,)).fetchone()
        if not parent or parent['entity_type'] != 'subcategory':
            raise HTTPException(status_code=400, detail='Product must belong to subcategory')
    slug = slugify(req.slug or req.name)
    if entity_type == 'category':
        url = req.url or f"/catalog/{slug}/"
    elif entity_type == 'subcategory':
        parent = conn.execute("SELECT slug FROM catalog_entities WHERE id=?", (parent_id,)).fetchone()
        url = req.url or f"/catalog/{parent['slug']}/{slug}/"
    else:
        parent = conn.execute("SELECT slug, parent_id FROM catalog_entities WHERE id=?", (parent_id,)).fetchone()
        cat = conn.execute("SELECT slug FROM catalog_entities WHERE id=?", (parent['parent_id'],)).fetchone()
        url = req.url or f"/catalog/{cat['slug']}/{parent['slug']}/{slug}/"
    cur = conn.execute("INSERT INTO catalog_entities (entity_type, parent_id, name, slug, url, image, description, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (entity_type, parent_id, req.name.strip(), slug, url, req.image or '', req.description or '', req.sort_order, 1 if req.is_active else 0))
    conn.commit()
    entity_id = cur.lastrowid
    row = dict(conn.execute("SELECT * FROM catalog_entities WHERE id=?", (entity_id,)).fetchone())
    conn.close()
    return row

@app.put("/api/admin/catalog/entities/{entity_id}")
def update_catalog_entity(entity_id: int, req: CatalogEntityRequest, token=Depends(get_token)):
    conn = get_db()
    current = conn.execute("SELECT * FROM catalog_entities WHERE id=?", (entity_id,)).fetchone()
    if not current:
        raise HTTPException(status_code=404, detail="Not found")
    current = dict(current)
    name = req.name.strip()
    slug = slugify(req.slug or name)
    parent_id = req.parent_id
    entity_type = current['entity_type']
    if entity_type != req.entity_type:
        raise HTTPException(status_code=400, detail='Entity type cannot be changed')
    if entity_type == 'category':
        url = req.url or f"/catalog/{slug}/"
    elif entity_type == 'subcategory':
        parent = conn.execute("SELECT slug, entity_type FROM catalog_entities WHERE id=?", (parent_id,)).fetchone()
        if not parent or parent['entity_type'] != 'category':
            raise HTTPException(status_code=400, detail='Subcategory must belong to category')
        url = req.url or f"/catalog/{parent['slug']}/{slug}/"
    else:
        parent = conn.execute("SELECT slug, parent_id, entity_type FROM catalog_entities WHERE id=?", (parent_id,)).fetchone()
        if not parent or parent['entity_type'] != 'subcategory':
            raise HTTPException(status_code=400, detail='Product must belong to subcategory')
        cat = conn.execute("SELECT slug FROM catalog_entities WHERE id=?", (parent['parent_id'],)).fetchone()
        url = req.url or f"/catalog/{cat['slug']}/{parent['slug']}/{slug}/"
    conn.execute("UPDATE catalog_entities SET parent_id=?, name=?, slug=?, url=?, image=?, description=?, sort_order=?, is_active=? WHERE id=?", (parent_id, name, slug, url, req.image or '', req.description or '', req.sort_order, 1 if req.is_active else 0, entity_id))
    conn.commit()
    row = dict(conn.execute("SELECT * FROM catalog_entities WHERE id=?", (entity_id,)).fetchone())
    conn.close()
    return row

@app.delete("/api/admin/catalog/entities/{entity_id}")
def delete_catalog_entity(entity_id: int, token=Depends(get_token)):
    conn = get_db()
    ids = [entity_id]
    idx = 0
    while idx < len(ids):
        children = conn.execute("SELECT id FROM catalog_entities WHERE parent_id=?", (ids[idx],)).fetchall()
        ids.extend([r['id'] for r in children])
        idx += 1
    conn.executemany("DELETE FROM catalog_entities WHERE id=?", [(i,) for i in reversed(ids)])
    conn.commit()
    conn.close()
    return {"deleted": ids}

@app.post("/api/admin/services/groups")
def create_service_group(req: ServiceGroupRequest, token=Depends(get_token)):
    conn = get_db()
    slug = slugify(req.slug or req.title)
    cur = conn.execute("INSERT INTO service_groups (title, slug, description, sort_order, is_active) VALUES (?, ?, ?, ?, ?)", (req.title.strip(), slug, req.description or '', req.sort_order, 1 if req.is_active else 0))
    conn.commit()
    row = dict(conn.execute("SELECT * FROM service_groups WHERE id=?", (cur.lastrowid,)).fetchone())
    conn.close()
    return row

@app.put("/api/admin/services/groups/{group_id}")
def update_service_group(group_id: int, req: ServiceGroupRequest, token=Depends(get_token)):
    conn = get_db()
    conn.execute("UPDATE service_groups SET title=?, slug=?, description=?, sort_order=?, is_active=? WHERE id=?", (req.title.strip(), slugify(req.slug or req.title), req.description or '', req.sort_order, 1 if req.is_active else 0, group_id))
    conn.commit()
    row = dict(conn.execute("SELECT * FROM service_groups WHERE id=?", (group_id,)).fetchone())
    conn.close()
    return row

@app.delete("/api/admin/services/groups/{group_id}")
def delete_service_group(group_id: int, token=Depends(get_token)):
    conn = get_db()
    conn.execute("DELETE FROM service_items WHERE group_id=?", (group_id,))
    conn.execute("DELETE FROM service_groups WHERE id=?", (group_id,))
    conn.commit()
    conn.close()
    return {"deleted": group_id}

@app.post("/api/admin/services/groups/{group_id}/items")
def create_service_item(group_id: int, req: ServiceItemRequest, token=Depends(get_token)):
    conn = get_db()
    cur = conn.execute("INSERT INTO service_items (group_id, title, sort_order, is_active) VALUES (?, ?, ?, ?)", (group_id, req.title.strip(), req.sort_order, 1 if req.is_active else 0))
    conn.commit()
    row = dict(conn.execute("SELECT * FROM service_items WHERE id=?", (cur.lastrowid,)).fetchone())
    conn.close()
    return row

@app.put("/api/admin/services/items/{item_id}")
def update_service_item(item_id: int, req: ServiceItemRequest, token=Depends(get_token)):
    conn = get_db()
    conn.execute("UPDATE service_items SET title=?, sort_order=?, is_active=? WHERE id=?", (req.title.strip(), req.sort_order, 1 if req.is_active else 0, item_id))
    conn.commit()
    row = dict(conn.execute("SELECT * FROM service_items WHERE id=?", (item_id,)).fetchone())
    conn.close()
    return row

@app.delete("/api/admin/services/items/{item_id}")
def delete_service_item(item_id: int, token=Depends(get_token)):
    conn = get_db()
    conn.execute("DELETE FROM service_items WHERE id=?", (item_id,))
    conn.commit()
    conn.close()
    return {"deleted": item_id}

# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("  Единый ресурс металла CRM API")
    print("  http://localhost:8000")
    print("  Swagger UI: http://localhost:8000/docs")
    print("=" * 60)
    uvicorn.run("api_server:app", host="0.0.0.0", port=8000, reload=True)
