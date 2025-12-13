#!/usr/bin/env python3
import os
import json
import sqlite3
from datetime import datetime
import re
import secrets
from datetime import timedelta
from math import radians, sin, cos, sqrt, atan2
from urllib.parse import unquote
from flask import Flask, jsonify, request, send_from_directory, abort, session, redirect
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

HERE = os.path.dirname(os.path.abspath(__file__))
# Top-level workspace root (one level above inner project/) to reach shared folders like images/
ROOT = os.path.dirname(HERE)
DATA_DIR = os.path.join(HERE, 'data')
BOOKSTORES_F = os.path.join(DATA_DIR, 'bookstores.json')
COMMENTS_F = os.path.join(DATA_DIR, 'comments.json')
INPUTS_F = os.path.join(DATA_DIR, 'inputs.json')
# Single authoritative database path (root level). Nested app instances will point here.
DB_PATH = os.path.join(HERE, 'website.db')
SCHEMA_PATH = os.path.join(HERE, 'project', 'schema.sql') if os.path.isdir(os.path.join(HERE, 'project')) else os.path.join(HERE, 'schema.sql')
MANAGER_KEY = os.environ.get('MANAGER_KEY', 'dev-manager')

app = Flask(__name__, static_folder=HERE)
# เปิดใช้งาน CORS และอนุญาต credentials สำหรับ session-based auth
from flask_cors import CORS
CORS(app, supports_credentials=True)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'dev-secret-key-change-me')

# Ensure session cookies behave well on mobile (HTTP, same-origin via IP)
app.config.update({
    'SESSION_COOKIE_SAMESITE': 'Lax',  # allow top-level navigation POST/redirects
    'SESSION_COOKIE_SECURE': False,    # ok for local HTTP development
    'SESSION_COOKIE_DOMAIN': None,     # default: host only (works with IP)
})
app.config['MAX_CONTENT_LENGTH'] = int(os.environ.get('MAX_UPLOAD_MB', '8')) * 1024 * 1024

# Feature toggles / configuration flags
VERIFY_REQUIRED = os.environ.get('EMAIL_VERIFY_REQUIRED', '0').lower() in ('1','true','yes','on')

os.makedirs(DATA_DIR, exist_ok=True)

# Ensure DB/schema and data are ready even when running via WSGI/flask run
@app.before_request
def something():
    # ...
    try:
        if not os.path.exists(BOOKSTORES_F):
            save_json(BOOKSTORES_F, [])
        if not os.path.exists(INPUTS_F):
            save_json(INPUTS_F, [])
        init_db()
        migrate_comments_from_json()
        ensure_schema_upgrades_and_ingest_shops()
    except Exception as e:
        print('[BOOTSTRAP ERROR]', e)

def load_json(path, default):
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return default
    return default

def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# in-memory caches for legacy JSON-backed endpoints (bookstores/inputs)
bookstores = load_json(BOOKSTORES_F, [])
inputs = load_json(INPUTS_F, [])

# -------- SQLite helpers --------
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn

def init_db():
    """Initialize base schema if missing. Further changes handled by upgrade routine."""
    os.makedirs(os.path.dirname(DB_PATH) if os.path.dirname(DB_PATH) else HERE, exist_ok=True)
    conn = get_db()
    try:
        schema_sql = ''
        if os.path.exists(SCHEMA_PATH):
            with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
                schema_sql = f.read()
        if schema_sql.strip():
            try:
                conn.executescript(schema_sql)
            except sqlite3.OperationalError:
                pass
        else:
            conn.executescript('''
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT NOT NULL UNIQUE,
              email TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              is_admin INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS comments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              page_id TEXT NOT NULL,
              content TEXT NOT NULL,
              store_name TEXT,
              shop_id INTEGER,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_comments_page_id ON comments(page_id);
            CREATE INDEX IF NOT EXISTS idx_comments_store_name ON comments(store_name);
            ''')
    finally:
        conn.commit()
        conn.close()

def migrate_comments_from_json():
    # One-time migration from data/comments.json to SQLite (best effort)
    try:
        src = load_json(COMMENTS_F, [])
        if not src:
            return
        conn = get_db()
        cur = conn.cursor()
        # ensure at least a default user exists
        def ensure_user(username):
            cur.execute('SELECT id FROM users WHERE username=?', (username,))
            row = cur.fetchone()
            if row:
                return row['id']
            # create a shadow user with random password
            ph = generate_password_hash('migrated_'+username)
            cur.execute('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
                        (username, f"{username}@example.local", ph))
            return cur.lastrowid
        # insert comments
        for c in src:
            user = (c.get('user') or c.get('username') or 'ผู้ใช้').strip() or 'ผู้ใช้'
            text = (c.get('text') or '').strip()
            if not text:
                continue
            store = (c.get('store') or c.get('store_name') or '').strip()
            page_id = ('store:'+store) if store else 'global'
            created = c.get('ts') or c.get('timestamp') or datetime.utcnow().isoformat()
            uid = ensure_user(user)
            cur.execute('INSERT INTO comments (user_id, page_id, content, store_name, created_at) VALUES (?,?,?,?,?)',
                        (uid, page_id, text, store or None, created))
        conn.commit()
        conn.close()
        # Optionally clear file after migration: keep file to preserve original behavior
    except Exception:
        # Do not break startup on migration errors
        pass

def ensure_schema_upgrades_and_ingest_shops():
    """Apply incremental schema upgrades (shops table, shop_id column) and ingest shops data from home.html/main.js.
    Safe to run on every startup."""
    conn = get_db()
    cur = conn.cursor()
    # 1. Users table may lack is_admin column (add if missing)
    try:
        cur.execute("PRAGMA table_info(users)")
        ucols = {r[1] for r in cur.fetchall()}
        if 'is_admin' not in ucols:
            cur.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
        if 'is_verified' not in ucols:
            # Existing users considered verified so they are not locked out
            cur.execute("ALTER TABLE users ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 1")
    except Exception:
        pass
    # 2. Create shops table if missing (idempotent)
    cur.execute("""CREATE TABLE IF NOT EXISTS shops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        address TEXT,
        rating REAL,
        image_url TEXT,
        category TEXT,
        phone TEXT,
        hours TEXT,
        latitude REAL,
        longitude REAL,
        tags TEXT,
        image_thumb_url TEXT,
        position INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )""")
    # 2.0 Ensure position column exists for ordering
    try:
        cur.execute("PRAGMA table_info(shops)")
        scols = {r[1] for r in cur.fetchall()}
        if 'position' not in scols:
            cur.execute("ALTER TABLE shops ADD COLUMN position INTEGER")
        if 'tags' not in scols:
            cur.execute("ALTER TABLE shops ADD COLUMN tags TEXT")
        if 'image_thumb_url' not in scols:
            cur.execute("ALTER TABLE shops ADD COLUMN image_thumb_url TEXT")
        if 'updated_at' not in scols:
            cur.execute("ALTER TABLE shops ADD COLUMN updated_at TEXT")
            try:
                cur.execute("UPDATE shops SET updated_at = created_at")
            except Exception:
                pass
    except Exception:
        pass
    # 3. Add shop_id column to comments if not present
    cur.execute("PRAGMA table_info(comments)")
    cols = {r[1] for r in cur.fetchall()}
    if 'shop_id' not in cols:
        try:
            cur.execute("ALTER TABLE comments ADD COLUMN shop_id INTEGER REFERENCES shops(id)")
        except Exception:
            pass
    # ensure index on new column (safe if column still missing - will raise and be ignored)
    try:
        cur.execute('CREATE INDEX IF NOT EXISTS idx_comments_shop_id ON comments(shop_id)')
    except Exception:
        pass
    # Password reset table (token based)
    try:
        cur.execute('''CREATE TABLE IF NOT EXISTS password_resets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            used_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )''')
        cur.execute('CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token)')
    except Exception:
        pass
    # 2.1 Allow duplicate emails: migrate users table to drop UNIQUE on email if present
    try:
        cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'")
        row = cur.fetchone()
        ddl = row[0] if row else ''
        if 'email TEXT NOT NULL UNIQUE' in (ddl or ''):
            # recreate users without UNIQUE on email
            cur.execute("CREATE TABLE IF NOT EXISTS users__new (\n              id INTEGER PRIMARY KEY AUTOINCREMENT,\n              username TEXT NOT NULL UNIQUE,\n              email TEXT NOT NULL,\n              password_hash TEXT NOT NULL,\n              is_admin INTEGER NOT NULL DEFAULT 0,\n              is_verified INTEGER NOT NULL DEFAULT 1,\n              created_at TEXT NOT NULL DEFAULT (datetime('now'))\n            )")
            cur.execute("INSERT INTO users__new (id, username, email, password_hash, is_admin, is_verified, created_at) SELECT id, username, email, password_hash, is_admin, 1, created_at FROM users")
            cur.execute("DROP TABLE users")
            cur.execute("ALTER TABLE users__new RENAME TO users")
    except Exception:
        pass
    # Magic-link email verification/login tokens
    try:
        cur.execute('''CREATE TABLE IF NOT EXISTS email_verifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            used_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )''')
        cur.execute('CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token)')
        cur.execute("PRAGMA table_info(email_verifications)")
        evcols = {r[1] for r in cur.fetchall()}
        if 'token_type' not in evcols:
            try:
                cur.execute("ALTER TABLE email_verifications ADD COLUMN token_type TEXT NOT NULL DEFAULT 'verify'")
            except Exception:
                pass
    except Exception:
        pass
    # 4. Ingest shops only if table empty
    cur.execute("SELECT COUNT(*) AS c FROM shops")
    count = cur.fetchone()[0]
    if count == 0:
        shops = []
        # Try parse main.js FALLBACK_STORES array for richer lat/lng data
        try:
            main_js_path = os.path.join(HERE, 'main.js')
            if os.path.exists(main_js_path):
                with open(main_js_path, 'r', encoding='utf-8') as f:
                    js = f.read()
                m = re.search(r'FALLBACK_STORES\s*=\s*\[(.*?)\]\s*;', js, re.DOTALL)
                if m:
                    arr_txt = '[' + m.group(1) + ']'
                    # Remove trailing commas that may appear before closing brackets
                    arr_txt = re.sub(r',\s*([\]\}])', r'\1', arr_txt)
                    try:
                        shops = json.loads(arr_txt)
                    except Exception:
                        shops = []
        except Exception:
            shops = []
        # Fallback: parse home.html store-card articles (limited fields, no lat/lng)
        if not shops:
            try:
                home_path = os.path.join(HERE, 'home.html')
                if os.path.exists(home_path):
                    with open(home_path, 'r', encoding='utf-8') as f:
                        html = f.read()
                    card_blocks = re.findall(r'<article class="store-card">(.*?)</article>', html, re.DOTALL)
                    for block in card_blocks:
                        name = re.search(r'<h3>(.*?)</h3>', block)
                        meta = re.search(r'<div class="meta">(.*?)</div>', block)
                        address = re.search(r'<p class="address">(.*?)</p>', block)
                        phone = re.search(r'<p class="phone">[^<]*?</p>', block)
                        hours = re.search(r'<p class="hours">(.*?)</p>', block)
                        tags = re.search(r'<div class="tags">(.*?)</div>', block)
                        rating = re.search(r'<div class="rating">\u2b50\s*([0-9.]+)</div>', block)  # ⭐ symbol
                        def clean(x):
                            return re.sub(r'<.*?>', '', x).strip() if x else None
                        nm = clean(name.group(1)) if name else None
                        if not nm:
                            continue
                        description = clean(meta.group(1)) if meta else ''
                        tg = clean(tags.group(1)) if tags else ''
                        full_desc = (description + ' | ' + tg).strip(' |')
                        shops.append({
                            'name': nm,
                            'description': full_desc,
                            'address': clean(address.group(1)) if address else None,
                            'rating': float(rating.group(1)) if rating else None,
                            'image_url': None,
                            'category': tg.split('·')[0].strip() if '·' in tg else None,
                            'phone': clean(phone.group(0)) if phone else None,
                            'hours': clean(hours.group(1)) if hours else None,
                            'latitude': None,
                            'longitude': None
                        })
            except Exception:
                pass
        # Normalize & insert
        for s in shops:
            try:
                cur.execute(
                    '''INSERT OR IGNORE INTO shops (name, description, address, rating, image_url, category, phone, hours, latitude, longitude)
                       VALUES (?,?,?,?,?,?,?,?,?,?)''',
                    (
                        s.get('name'),
                        s.get('description') or (f"{s.get('category','')} | {s.get('books','')}".strip(' |')),
                        s.get('address'),
                        s.get('rating'),
                        s.get('image_url'),
                        s.get('category'),
                        s.get('phone'),
                        s.get('hours'),
                        s.get('lat') or s.get('latitude'),
                        s.get('lng') or s.get('longitude')
                    )
                )
            except Exception:
                continue
        # 5. Backfill shop_id in comments
        try:
            cur.execute('UPDATE comments SET shop_id=(SELECT id FROM shops WHERE shops.name = comments.store_name) WHERE shop_id IS NULL AND store_name IS NOT NULL')
        except Exception:
            pass
    conn.commit()
    # Initialize position ordering if missing
    try:
        cur = conn.cursor()
        cur.execute("UPDATE shops SET position = id WHERE position IS NULL")
        conn.commit()
    except Exception:
        pass
    conn.close()

# -------- Helper: auth / validation --------
EMAIL_RE = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')

def current_user():
    if not session.get('user_id'):
        return None
    return {
        'id': session['user_id'],
        'username': session.get('username'),
        'email': session.get('email'),
        'is_admin': session.get('is_admin', 0)
    }

def require_login():
    if not session.get('user_id'):
        return jsonify({'status':'error','message':'login required'}), 401

def require_admin():
    if not session.get('user_id') or not session.get('is_admin'):
        return jsonify({'status':'error','message':'admin required'}), 403

def sanitize_text(s, max_len=2000):
    s = (s or '').strip()
    if len(s) > max_len:
        s = s[:max_len]
    return s

def has_manager_access(payload=None):
    me = current_user()
    if me and me.get('is_admin'):
        return True
    expected = MANAGER_KEY
    if not expected:
        return False
    provided = request.headers.get('x-manager-key') or request.args.get('manager_key')
    if not provided and isinstance(payload, dict):
        provided = payload.get('manager_key')
    if not provided:
        return False
    try:
        return secrets.compare_digest(str(provided), str(expected))
    except Exception:
        return str(provided) == str(expected)

def _first_value(data, keys):
    for key in keys:
        if key in data:
            return data.get(key), True
    return None, False

def _coerce_float(value):
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        if value == '':
            return None
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError

def parse_bookstore_payload(data, partial=False):
    errors = []
    payload = {}

    def assign_text(field, aliases, required=False):
        value, provided = _first_value(data, aliases)
        if not provided:
            if required and not partial:
                errors.append(f'{field} required')
            return
        if isinstance(value, str):
            value = value.strip()
        if not value:
            payload[field] = None
            if required:
                errors.append(f'{field} required')
            return
        payload[field] = value

    def assign_float(field, aliases, min_val=None, max_val=None, required=False):
        value, provided = _first_value(data, aliases)
        if not provided:
            if required and not partial:
                errors.append(f'{field} required')
            return
        try:
            num = _coerce_float(value)
        except ValueError:
            errors.append(f'{field} must be a number')
            return
        if num is None:
            payload[field] = None
            if required:
                errors.append(f'{field} required')
            return
        if min_val is not None and num < min_val:
            errors.append(f'{field} must be >= {min_val}')
            return
        if max_val is not None and num > max_val:
            errors.append(f'{field} must be <= {max_val}')
            return
        payload[field] = num

    assign_text('name', ['name'], required=True)
    assign_text('description', ['description', 'meta'])
    assign_text('address', ['address', 'location'])
    assign_text('phone', ['phone'])
    assign_text('hours', ['hours'])
    assign_text('category', ['category', 'type'])
    assign_text('tags', ['tags', 'books'])
    assign_text('image_url', ['image_url', 'imageUrl'])
    assign_text('image_thumb_url', ['image_thumb_url', 'imageThumbUrl', 'thumbnail'])
    assign_float('rating', ['rating'], min_val=0, max_val=5)
    assign_float('latitude', ['latitude', 'lat'], required=not partial)
    assign_float('longitude', ['longitude', 'lng'], required=not partial)

    return payload, errors

def serialize_shop_row(row):
    if row is None:
        return None
    data = dict(row)
    lat = data.get('latitude')
    lng = data.get('longitude')
    tags = data.get('tags')
    category = data.get('category') or (tags.split(',')[0].strip() if isinstance(tags, str) and tags.strip() else None)
    store = {
        'id': data.get('id'),
        'name': data.get('name'),
        'description': data.get('description'),
        'address': data.get('address'),
        'location': data.get('address'),
        'category': category,
        'type': category or data.get('description'),
        'tags': tags,
        'books': tags,
        'phone': data.get('phone'),
        'hours': data.get('hours'),
        'rating': data.get('rating'),
        'image_url': data.get('image_url'),
        'image_thumb_url': data.get('image_thumb_url'),
        'lat': lat,
        'lng': lng,
        'latitude': lat,
        'longitude': lng,
        'created_at': data.get('created_at'),
        'updated_at': data.get('updated_at'),
        'position': data.get('position')
    }
    if data.get('distance_km') is not None:
        store['distance_km'] = data['distance_km']
    return store

def build_image_variants(shop):
    variants = []
    main = shop.get('image_url')
    thumb = shop.get('image_thumb_url')
    if main:
        variants.append({'type': 'main', 'url': main})
    if thumb:
        variants.append({'type': 'thumb', 'url': thumb})
    return variants

def refresh_bookstore_cache_from_db():
    """Update legacy bookstores.json cache from current shops table for offline fallbacks."""
    global bookstores
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM shops ORDER BY id")
        rows = [serialize_shop_row(dict(r)) for r in cur.fetchall()]
        bookstores = rows
        save_json(BOOKSTORES_F, bookstores)
    except Exception:
        pass
    finally:
        try:
            conn.close()
        except Exception:
            pass

# Lightweight health check to help diagnose environment issues
@app.route('/api/health', methods=['GET'])
def api_health():
    info = {'status': 'ok', 'db': 'unknown', 'schema': {}}
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {r[0] for r in cur.fetchall()}
        info['db'] = 'connected'
        for t in ['users','comments','email_verifications','password_resets','shops']:
            info['schema'][t] = t in tables
        conn.close()
    except Exception as e:
        info['db'] = f"error: {e.__class__.__name__}"
    return jsonify(info)

@app.route('/')
def index():
    return send_from_directory(HERE, 'home.html')

@app.route('/home')
def home_page():
    return send_from_directory(HERE, 'home.html')

@app.route('/hello')
def hello():
    return jsonify({"message": "สวัสดีจาก Python API!"})

@app.route('/<path:filename>')
def static_files(filename):
    p = os.path.join(HERE, filename)
    if os.path.exists(p) and os.path.commonpath([HERE, p]) == HERE:
        return send_from_directory(HERE, filename)
    abort(404)

# Serve images from the app's images folder (co-located with HTML)
# The workspace currently stores images under HERE/images
IMAGES_DIR = os.path.join(HERE, 'images')
UPLOADS_DIR = os.path.join(IMAGES_DIR, 'uploads')
PUBLIC_UPLOAD_PREFIX = 'images/uploads'

@app.route('/images/<path:filename>')
def images_files(filename):
    p = os.path.join(IMAGES_DIR, filename)
    # Basic path traversal protection and existence check
    try:
        if os.path.exists(p) and os.path.commonpath([IMAGES_DIR, p]) == IMAGES_DIR:
            return send_from_directory(IMAGES_DIR, filename)
    except Exception:
        pass
    abort(404)

# Simple image upload endpoint for admin/creation flows
ALLOWED_IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}

def _store_uploaded_image(file_storage):
    filename = secure_filename(file_storage.filename)
    base, ext = os.path.splitext(filename)
    ext = ext.lower()
    if ext not in ALLOWED_IMAGE_EXTS:
        raise ValueError('unsupported file type')
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    token = secrets.token_hex(6)
    safe_base = (base or 'image')[:50]
    final_name = f"{safe_base}_{token}{ext}"
    dest = os.path.join(UPLOADS_DIR, final_name)
    file_storage.save(dest)
    rel_path = f"{PUBLIC_UPLOAD_PREFIX}/{final_name}"
    return final_name, rel_path, dest

@app.route('/api/upload-image', methods=['POST'])
@app.route('/api/bookstores/upload', methods=['POST'])
def api_upload_image():
    try:
        f = request.files.get('image') or request.files.get('file')
        if not f or not getattr(f, 'filename', ''):
            return jsonify({'status': 'error', 'message': 'file required'}), 400
        final_name, rel_path, dest = _store_uploaded_image(f)
        payload = {
            'status': 'success',
            'message': 'uploaded',
            'url': f"/{rel_path}",
            'original': rel_path,
            'variants': {
                'large': rel_path,
                'medium': rel_path,
                'thumb': rel_path
            },
            'filename': final_name,
            'path': dest
        }
        return jsonify(payload)
    except ValueError as ve:
        return jsonify({'status': 'error', 'message': str(ve)}), 400
    except Exception as e:
        return jsonify({'status': 'error', 'message': 'upload failed', 'error': str(e)}), 500

# Debug: list images to help verify uploads exist
@app.route('/api/images/list', methods=['GET'])
def api_images_list():
    try:
        files = []
        if os.path.isdir(IMAGES_DIR):
            for name in sorted(os.listdir(IMAGES_DIR)):
                files.append({
                    'name': name,
                    'url': f"/images/{name}",
                    'size': os.path.getsize(os.path.join(IMAGES_DIR, name))
                })
        return jsonify({'status':'success','count': len(files), 'data': files})
    except Exception as e:
        return jsonify({'status':'error','message':'list failed','error': str(e)}), 500

# ========== AUTH (SQLite-backed) ==========
@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.get_json(force=True) or {}
    username = (data.get('username') or data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    if not username or not email or not password:
        return jsonify({'status':'error','message':'username, email, password required'}), 400
    if not EMAIL_RE.match(email):
        return jsonify({'status':'error','message':'invalid email format'}), 400
    if len(password) < 6:
        return jsonify({'status':'error','message':'password too short'}), 400
    conn = get_db()
    try:
        cur = conn.cursor()
        # Enforce unique username; allow duplicate emails (verification is per-user)
        cur.execute('SELECT 1 FROM users WHERE username=?', (username,))
        if cur.fetchone():
            return jsonify({'status':'error','message':'username already exists'}), 409
        # Determine if this is the first user (make admin)
        cur.execute('SELECT COUNT(*) FROM users')
        is_first = cur.fetchone()[0] == 0
        ph = generate_password_hash(password)
        try:
            # Respect verification requirement toggle
            initial_verified = 0 if VERIFY_REQUIRED else 1
            cur.execute('INSERT INTO users (username, email, password_hash, is_admin, is_verified) VALUES (?,?,?,?,?)',
                        (username, email, ph, 1 if is_first else 0, initial_verified))
            conn.commit()
        except sqlite3.IntegrityError as ie:
            # Handle legacy UNIQUE(email) databases gracefully
            msg = str(ie).lower()
            if 'unique' in msg and 'email' in msg:
                return jsonify({'status':'error','message':'email already exists'}), 409
            if 'unique' in msg and 'username' in msg:
                return jsonify({'status':'error','message':'username already exists'}), 409
            return jsonify({'status':'error','message':'registration failed'}), 400
        user_id = cur.lastrowid
        # Create verification token only if required
        verify_needed = False
        verify_url = None
        if VERIFY_REQUIRED:
            token = secrets.token_urlsafe(32)
            expires = (datetime.utcnow() + timedelta(minutes=30)).isoformat()
            try:
                cur.execute('INSERT INTO email_verifications (user_id, token, expires_at, token_type) VALUES (?,?,?,?)', (user_id, token, expires, 'verify'))
                conn.commit()
                base = request.host_url.rstrip('/')
                verify_url = f"{base}/api/verify/confirm?token={token}"
                verify_needed = True
            except Exception:
                verify_needed = False
        # Establish session immediately (still may require email verification for certain actions)
        session['user_id'] = user_id
        session['username'] = username
        session['email'] = email
        session['is_admin'] = 1 if is_first else 0
        return jsonify({'status':'success','user': {
            'id': user_id, 'username': username, 'email': email, 'is_admin': 1 if is_first else 0
        }, 'verify_needed': verify_needed, 'verify_url_preview': verify_url})
    finally:
        conn.close()

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json(force=True) or {}
    identifier = (data.get('email') or data.get('username') or data.get('identifier') or '').strip().lower()
    password = data.get('password') or ''
    if not identifier or not password:
        return jsonify({'status':'error','message':'identifier and password required'}), 400
    conn = get_db()
    try:
        cur = conn.cursor()
        if EMAIL_RE.match(identifier):
            cur.execute('SELECT id, username, email, password_hash, is_admin, is_verified FROM users WHERE email=? COLLATE NOCASE', (identifier,))
        else:
            cur.execute('SELECT id, username, email, password_hash, is_admin, is_verified FROM users WHERE lower(username)=lower(?)', (identifier,))
        rows = cur.fetchall()
        match = None
        for r in rows:
            try:
                if check_password_hash(r['password_hash'], password):
                    match = r
                    break
            except Exception:
                continue
        if not match:
            return jsonify({'status':'error','message':'invalid username/email or password'}), 401
        if VERIFY_REQUIRED and match['is_verified'] == 0:
            return jsonify({'status':'unverified','message':'บัญชียังไม่ยืนยันอีเมล กรุณาตรวจสอบอีเมลหรือส่งใหม่'}), 403
        session['user_id'] = match['id']
        session['username'] = match['username']
        session['email'] = match['email']
        session['is_admin'] = match['is_admin']
        return jsonify({'status':'success','user': {
            'id': match['id'], 'username': match['username'], 'email': match['email'], 'is_admin': match['is_admin']
        }})
    finally:
        conn.close()
def api_password_reset():
    data = request.get_json(force=True) or {}
    token = (data.get('token') or '').strip()
    new_password = data.get('new_password') or ''
    if not token or not new_password:
        return jsonify({'status':'error','message':'token and new_password required'}), 400
    if len(new_password) < 6:
        return jsonify({'status':'error','message':'password too short'}), 400
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute('SELECT id, user_id, expires_at, used_at FROM password_resets WHERE token=?', (token,))
        row = cur.fetchone()
        if not row:
            return jsonify({'status':'error','message':'invalid token'}), 400
        if row['used_at'] is not None:
            return jsonify({'status':'error','message':'token already used'}), 400
        # expiry check
        if datetime.utcnow() > datetime.fromisoformat(row['expires_at']):
            return jsonify({'status':'error','message':'token expired'}), 400
        # update password
        ph = generate_password_hash(new_password)
        cur.execute('UPDATE users SET password_hash=? WHERE id=?', (ph, row['user_id']))
        cur.execute('UPDATE password_resets SET used_at=? WHERE id=?', (datetime.utcnow().isoformat(), row['id']))
        conn.commit()
        return jsonify({'status':'success','message':'password updated'})
    finally:
        conn.close()

# --- Magic-link login endpoints ---
def _send_email(to_email: str, subject: str, body: str):
    host = os.environ.get('SMTP_HOST')
    port = int(os.environ.get('SMTP_PORT', '0') or 0)
    user = os.environ.get('SMTP_USER')
    password = os.environ.get('SMTP_PASS')
    use_tls = os.environ.get('SMTP_TLS', '0') == '1'
    from_addr = os.environ.get('SMTP_FROM', user or 'no-reply@example.com')
    if not host or not port or not from_addr:
        print('[EMAIL:FALLBACK] To:', to_email)
        print('Subject:', subject)
        print('Body:\n', body)
        return False
    try:
        import smtplib
        from email.mime.text import MIMEText
        msg = MIMEText(body, 'plain', 'utf-8')
        msg['Subject'] = subject
        msg['From'] = from_addr
        msg['To'] = to_email
        server = smtplib.SMTP(host, port, timeout=10)
        if use_tls:
            server.starttls()
        if user and password:
            server.login(user, password)
        server.sendmail(from_addr, [to_email], msg.as_string())
        server.quit()
        return True
    except Exception as e:
        print('[EMAIL:ERROR]', e)
        print('[EMAIL:FALLBACK] To:', to_email)
        print('Subject:', subject)
        print('Body:\n', body)
        return False

@app.route('/api/auth/magic/request', methods=['POST'])
def api_magic_request():
    data = request.get_json(force=True) or {}
    email = (data.get('email') or '').strip().lower()
    if not EMAIL_RE.match(email):
        return jsonify({'status':'error','message':'invalid email format'}), 400
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute('SELECT id, email FROM users WHERE email=? COLLATE NOCASE', (email,))
        rows = cur.fetchall()
        if not rows:
            # auto-register lightweight account
            username = email.split('@')[0]
            cur.execute('INSERT INTO users (username, email, password_hash, is_admin) VALUES (?,?,?,0)', (username, email, ''))
            user_id = cur.lastrowid
        elif len(rows) > 1:
            # Ambiguous: multiple accounts share the same email; ask for password login
            return jsonify({'status':'error','message':'มีหลายบัญชีใช้อีเมลนี้ โปรดเข้าสู่ระบบด้วยรหัสผ่านหรือระบุชื่อผู้ใช้'}), 409
        else:
            user_id = rows[0]['id']
        token = secrets.token_urlsafe(32)
        expires = (datetime.utcnow() + timedelta(minutes=30)).isoformat()
        cur.execute('INSERT INTO email_verifications (user_id, token, expires_at, token_type) VALUES (?,?,?,?)', (user_id, token, expires, 'magic'))
        conn.commit()
    finally:
        conn.close()
    base = request.host_url.rstrip('/')
    verify_url = f"{base}/api/auth/magic/verify?token={token}"
    subject = 'ลิงก์เข้าสู่ระบบ'
    body = f"คลิกลิงก์นี้เพื่อเข้าสู่ระบบ:\n{verify_url}\n\nลิงก์จะหมดอายุภายใน 30 นาที"
    _send_email(email, subject, body)
    return jsonify({'status':'success','message':'ส่งลิงก์เข้าสู่ระบบไปยังอีเมลแล้ว', 'verify_url_preview': verify_url})

@app.route('/api/auth/magic/verify', methods=['GET'])
def api_magic_verify():
    token = request.args.get('token') or ''
    if not token:
        return jsonify({'status':'error','message':'invalid token'}), 400
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute('SELECT id, user_id, expires_at, used_at FROM email_verifications WHERE token=?', (token,))
        row = cur.fetchone()
        if not row:
            return jsonify({'status':'error','message':'invalid token'}), 400
        if row['used_at'] is not None:
            return jsonify({'status':'error','message':'token already used'}), 400
        try:
            if datetime.utcnow() > datetime.fromisoformat(row['expires_at']):
                return jsonify({'status':'error','message':'token expired'}), 400
        except Exception:
            return jsonify({'status':'error','message':'bad expiry'}), 400
        # mark used
        cur.execute("UPDATE email_verifications SET used_at=? WHERE id=?", (datetime.utcnow().isoformat(), row['id']))
        cur.execute('SELECT id, username, email, is_admin FROM users WHERE id=?', (row['user_id'],))
        u = cur.fetchone()
        conn.commit()
    finally:
        conn.close()
    session['user_id'] = u['id']
    session['username'] = u['username']
    session['email'] = u['email']
    session['is_admin'] = u['is_admin']
    return redirect('/home')

@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({'status':'success'})

@app.route('/api/me', methods=['GET'])
def api_me():
    if not session.get('user_id'):
        return jsonify({'authenticated': False}), 401
    # include verification state
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute('SELECT is_verified FROM users WHERE id=?', (session['user_id'],))
        row = cur.fetchone()
        return jsonify({'authenticated': True, 'id': session['user_id'], 'username': session.get('username'), 'email': session.get('email'), 'is_admin': session.get('is_admin',0), 'is_verified': (row['is_verified'] if row else 1)})
    finally:
        conn.close()

@app.route('/api/config', methods=['GET'])
def api_config():
    # Basic runtime flags for frontend logic
    return jsonify({'email_verify_required': VERIFY_REQUIRED})
@app.route('/api/verify/request', methods=['POST'])
def api_verify_request():
    data = request.get_json(force=True) or {}
    email = (data.get('email') or '').strip().lower()
    username = (data.get('username') or '').strip() if data.get('username') else None
    if not EMAIL_RE.match(email):
        return jsonify({'status':'error','message':'invalid email format'}), 400
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute('SELECT id, username FROM users WHERE email=? COLLATE NOCASE', (email,))
        rows = cur.fetchall()
        if not rows:
            return jsonify({'status':'error','message':'email not found'}), 404
        if len(rows) > 1 and not username:
            return jsonify({'status':'ambiguous','message':'หลายบัญชีใช้อีเมลนี้ โปรดระบุ username', 'usernames':[r['username'] for r in rows]}), 409
        target = None
        if len(rows) == 1:
            target = rows[0]
        else:
            for r in rows:
                if r['username'].lower() == username.lower():
                    target = r
                    break
            if not target:
                return jsonify({'status':'error','message':'username not matched'}), 404
        # create verification token
        token = secrets.token_urlsafe(32)
        expires = (datetime.utcnow() + timedelta(minutes=30)).isoformat()
        cur.execute('INSERT INTO email_verifications (user_id, token, expires_at, token_type) VALUES (?,?,?,?)', (target['id'], token, expires, 'verify'))
        conn.commit()
        base = request.host_url.rstrip('/')
        verify_url = f"{base}/api/verify/confirm?token={token}"
        return jsonify({'status':'success','verify_url_preview': verify_url})
    finally:
        conn.close()

@app.route('/api/verify/confirm', methods=['GET'])
def api_verify_confirm():
    token = request.args.get('token') or ''
    if not token:
        return jsonify({'status':'error','message':'invalid token'}), 400
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute('SELECT id, user_id, expires_at, used_at FROM email_verifications WHERE token=?', (token,))
        row = cur.fetchone()
        if not row:
            return jsonify({'status':'error','message':'invalid token'}), 400
        if row['used_at'] is not None:
            return jsonify({'status':'error','message':'token already used'}), 400
        try:
            if datetime.utcnow() > datetime.fromisoformat(row['expires_at']):
                return jsonify({'status':'error','message':'token expired'}), 400
        except Exception:
            return jsonify({'status':'error','message':'bad expiry'}), 400
        # mark used + verify user
        cur.execute('UPDATE email_verifications SET used_at=? WHERE id=?', (datetime.utcnow().isoformat(), row['id']))
        cur.execute('UPDATE users SET is_verified=1 WHERE id=?', (row['user_id'],))
        cur.execute('SELECT id, username, email, is_admin FROM users WHERE id=?', (row['user_id'],))
        u = cur.fetchone()
        conn.commit()
    finally:
        conn.close()
    session['user_id'] = u['id']
    session['username'] = u['username']
    session['email'] = u['email']
    session['is_admin'] = u['is_admin']
    return redirect('/home')

# -------- Users CRUD (admin/self) --------
@app.route('/api/users', methods=['GET'])
def api_users_list():
    # admin only
    if not session.get('is_admin'):
        return jsonify({'status':'error','message':'admin required'}), 403
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute('SELECT id, username, email, is_admin, created_at FROM users ORDER BY id')
        return jsonify({'status':'success','data':[dict(r) for r in cur.fetchall()]})
    finally:
        conn.close()

@app.route('/api/users/<int:user_id>', methods=['GET','PUT','DELETE'])
def api_user_item(user_id):
    me = current_user()
    if not me:
        return jsonify({'status':'error','message':'login required'}), 401
    conn = get_db()
    try:
        cur = conn.cursor()
        if request.method == 'GET':
            cur.execute('SELECT id, username, email, is_admin, created_at FROM users WHERE id=?', (user_id,))
            row = cur.fetchone()
            if not row:
                return jsonify({'status':'error','message':'not found'}), 404
            return jsonify({'status':'success','data': dict(row)})
        if request.method == 'PUT':
            # only self or admin
            if not (me['is_admin'] or me['id'] == user_id):
                return jsonify({'status':'error','message':'forbidden'}), 403
            data = request.get_json(force=True) or {}
            new_username = sanitize_text(data.get('username'), 64) if data.get('username') else None
            new_email = (data.get('email') or '').strip().lower() if data.get('email') else None
            promote_admin = data.get('is_admin') if me['is_admin'] else None  # only admin can toggle
            fields = []
            params = []
            if new_username:
                fields.append('username=?')
                params.append(new_username)
            if new_email:
                if not EMAIL_RE.match(new_email):
                    return jsonify({'status':'error','message':'invalid email format'}), 400
                fields.append('email=?')
                params.append(new_email)
            if promote_admin is not None:
                fields.append('is_admin=?')
                params.append(1 if promote_admin else 0)
            if fields:
                params.append(user_id)
                try:
                    cur.execute(f"UPDATE users SET {', '.join(fields)} WHERE id=?", tuple(params))
                    conn.commit()
                except sqlite3.IntegrityError:
                    return jsonify({'status':'error','message':'duplicate username/email'}), 409
            # refresh session if self modified
            if me['id'] == user_id:
                cur.execute('SELECT username, email, is_admin FROM users WHERE id=?', (user_id,))
                r = cur.fetchone()
                session['username'] = r['username']
                session['email'] = r['email']
                session['is_admin'] = r['is_admin']
            return jsonify({'status':'success'})
        if request.method == 'DELETE':
            # admin or self (cannot delete self if last admin)
            if not (me['is_admin'] or me['id'] == user_id):
                return jsonify({'status':'error','message':'forbidden'}), 403
            if me['id'] == user_id and me['is_admin']:
                # ensure at least one other admin exists
                cur.execute('SELECT COUNT(*) FROM users WHERE is_admin=1 AND id!=?', (user_id,))
                if cur.fetchone()[0] == 0:
                    return jsonify({'status':'error','message':'cannot delete last admin'}), 400
            cur.execute('DELETE FROM users WHERE id=?', (user_id,))
            conn.commit()
            # if deleting own account, clear session
            if me['id'] == user_id:
                session.clear()
            return jsonify({'status':'success'})
    finally:
        conn.close()

# -------- Shops Endpoints --------
@app.route('/api/shops', methods=['GET'])
def api_shops():
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id,name,description,address,rating,image_url,category,phone,hours,latitude,longitude,position FROM shops ORDER BY (position IS NULL), position, id")
        rows = [dict(r) for r in cur.fetchall()]
        return jsonify(rows)
    finally:
        conn.close()

@app.route('/api/shops', methods=['POST'])
def api_shops_create():
    data = request.get_json(force=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'status':'error','message':'name required'}), 400
    description = (data.get('description') or '').strip()
    address = (data.get('address') or '').strip()
    # rating can be None; if provided, coerce to float safely
    rating = data.get('rating')
    try:
        rating = float(rating) if rating is not None and str(rating).strip()!='' else None
    except Exception:
        rating = None
    image_url = (data.get('image_url') or '').strip() or None  # allow data URL or path
    category = (data.get('category') or '').strip() or None
    phone = (data.get('phone') or '').strip() or None
    hours = (data.get('hours') or '').strip() or None
    lat = data.get('lat') if data.get('lat') is not None else data.get('latitude')
    lng = data.get('lng') if data.get('lng') is not None else data.get('longitude')
    try:
        lat = float(lat) if lat is not None and str(lat).strip()!='' else None
    except Exception:
        lat = None
    try:
        lng = float(lng) if lng is not None and str(lng).strip()!='' else None
    except Exception:
        lng = None
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute('''INSERT INTO shops (name, description, address, rating, image_url, category, phone, hours, latitude, longitude, position)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
                    (name, description, address, rating, image_url, category, phone, hours, lat, lng, None))
        new_id = cur.lastrowid
        try:
            cur.execute('UPDATE shops SET position=? WHERE id=? AND position IS NULL', (new_id, new_id))
        except Exception:
            pass
        conn.commit()
        return jsonify({'status':'success','id': new_id, 'name': name}), 201
    except sqlite3.IntegrityError:
        return jsonify({'status':'error','message':'duplicate shop name'}), 409
    finally:
        conn.close()

@app.route('/api/shops/<int:shop_id>', methods=['GET'])
def api_shop_detail(shop_id):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id,name,description,address,rating,image_url,category,phone,hours,latitude,longitude FROM shops WHERE id=?", (shop_id,))
        shop = cur.fetchone()
        if not shop:
            return jsonify({'status':'error','message':'not found'}), 404
        cur.execute('''SELECT c.id, c.content as text, c.created_at as ts, u.username as user,
                              c.store_name as store, c.shop_id
                       FROM comments c JOIN users u ON u.id=c.user_id
                       WHERE c.shop_id=? ORDER BY c.id DESC''', (shop_id,))
        comments = [dict(r) for r in cur.fetchall()]
        return jsonify({'status':'success','shop': dict(shop), 'comments': comments, 'comment_count': len(comments)})
    finally:
        conn.close()

@app.route('/api/shops/<int:shop_id>', methods=['PUT','DELETE'])
def api_shop_update_delete(shop_id):
    conn = get_db()
    try:
        cur = conn.cursor()
        # ensure exists
        cur.execute('SELECT id FROM shops WHERE id=?', (shop_id,))
        if not cur.fetchone():
            return jsonify({'status':'error','message':'not found'}), 404
        if request.method == 'DELETE':
            cur.execute('DELETE FROM shops WHERE id=?', (shop_id,))
            conn.commit()
            return jsonify({'status':'success'})
        # update
        data = request.get_json(force=True) or {}
        fields = []
        params = []
        def add_field(col, val):
            fields.append(f"{col}=?"); params.append(val)
        for key in ['name','description','address','image_url','category','phone','hours']:
            if key in data:
                add_field(key, (data.get(key) or '').strip() or None)
        if 'rating' in data:
            try:
                r = data.get('rating')
                r = float(r) if r is not None and str(r).strip()!='' else None
            except Exception:
                r = None
            add_field('rating', r)
        # lat/lng
        if 'lat' in data or 'latitude' in data:
            try:
                la = data.get('lat', data.get('latitude'))
                la = float(la) if la is not None and str(la).strip()!='' else None
            except Exception:
                la = None
            add_field('latitude', la)
        if 'lng' in data or 'longitude' in data:
            try:
                lo = data.get('lng', data.get('longitude'))
                lo = float(lo) if lo is not None and str(lo).strip()!='' else None
            except Exception:
                lo = None
            add_field('longitude', lo)
        if fields:
            params.append(shop_id)
            cur.execute(f"UPDATE shops SET {', '.join(fields)} WHERE id=?", tuple(params))
            conn.commit()
        return jsonify({'status':'success'})
    finally:
        conn.close()

@app.route('/api/shops/reorder', methods=['POST'])
def api_shops_reorder():
    """Persist new ordering of shops by setting `position` sequentially.
    Body: { "order": [id1, id2, ...] } or { "ids": [...] }
    """
    data = request.get_json(force=True) or {}
    order = data.get('order') or data.get('ids')
    if not isinstance(order, list) or not order:
        return jsonify({'status':'error','message':'order array required'}), 400
    conn = get_db()
    try:
        cur = conn.cursor()
        pos = 1
        seen = []
        for sid in order:
            try:
                sid_int = int(sid)
            except Exception:
                continue
            seen.append(sid_int)
            cur.execute('UPDATE shops SET position=? WHERE id=?', (pos, sid_int))
            pos += 1
        # push remaining shops after specified ones, preserving current order by id/position
        if seen:
            placeholders = ','.join(['?']*len(seen))
            cur.execute(f'SELECT id FROM shops WHERE id NOT IN ({placeholders}) ORDER BY (position IS NULL), position, id', tuple(seen))
        else:
            cur.execute('SELECT id FROM shops ORDER BY (position IS NULL), position, id')
        for r in cur.fetchall():
            cur.execute('UPDATE shops SET position=? WHERE id=?', (pos, r['id']))
            pos += 1
        conn.commit()
        return jsonify({'status':'success','count': pos-1})
    finally:
        conn.close()

# -------- Stores CRUD --------
def _ensure_store_ids():
    global bookstores
    changed = False
    next_id = (max([s.get('id',0) for s in bookstores]) + 1) if bookstores else 1
    for s in bookstores:
        if s.get('id') is None:
            s['id'] = next_id
            next_id += 1
            changed = True
    if changed:
        save_json(BOOKSTORES_F, bookstores)
@app.route('/api/bookstores', methods=['GET', 'POST'])
def api_bookstores():
    if request.method == 'GET':
        conn = get_db()
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM shops")
            rows = [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()
        if not rows:
            _ensure_store_ids()
            return jsonify({'status':'success','count':len(bookstores),'data':bookstores})
        args = request.args
        sort_key = (args.get('sort') or '').lower()
        lat_param = args.get('lat') or args.get('latitude')
        lng_param = args.get('lng') or args.get('longitude')
        radius_param = args.get('radius')
        limit_param = args.get('limit')
        lat = lng = None
        coords_valid = False
        try:
            if lat_param is not None and lng_param is not None:
                lat = float(lat_param)
                lng = float(lng_param)
                coords_valid = True
        except (TypeError, ValueError):
            coords_valid = False
        if coords_valid:
            for row in rows:
                try:
                    slat = float(row.get('latitude')) if row.get('latitude') is not None else None
                    slng = float(row.get('longitude')) if row.get('longitude') is not None else None
                except (TypeError, ValueError):
                    slat = slng = None
                if slat is None or slng is None:
                    row['distance_km'] = None
                    continue
                row['distance_km'] = round(haversine_km(lat, lng, slat, slng), 2)
        radius = None
        if coords_valid and radius_param not in (None, ''):
            try:
                radius = float(radius_param)
            except (TypeError, ValueError):
                radius = None
        if radius and radius > 0 and coords_valid:
            rows = [r for r in rows if r.get('distance_km') is not None and r['distance_km'] <= radius]
        if sort_key == 'distance' and coords_valid:
            rows = [r for r in rows if r.get('distance_km') is not None]
            rows.sort(key=lambda r: r['distance_km'])
        elif sort_key == 'latest':
            def created_key(row):
                try:
                    return datetime.fromisoformat(row.get('created_at')) if row.get('created_at') else datetime.min
                except Exception:
                    return datetime.min
            rows.sort(key=created_key, reverse=True)
        elif sort_key == 'rating':
            rows.sort(key=lambda r: (r.get('rating') or 0), reverse=True)
        else:
            rows.sort(key=lambda r: ((r.get('position') is None), r.get('position') or r.get('id') or 0))
        if limit_param not in (None, ''):
            try:
                limit = int(limit_param)
            except (TypeError, ValueError):
                limit = None
            if limit and limit > 0:
                rows = rows[:limit]
        data = [serialize_shop_row(r) for r in rows]
        return jsonify({'status':'success','count':len(data),'data':data})
    data = request.get_json(force=True) or {}
    payload, errors = parse_bookstore_payload(data, partial=False)
    if errors:
        return jsonify({'status':'error','message':errors[0],'errors':errors}), 400
    conn = get_db()
    try:
        cur = conn.cursor()
        now_ts = datetime.utcnow().isoformat(sep=' ', timespec='seconds')
        cur.execute('''INSERT INTO shops (name, description, address, rating, image_url, category, phone, hours, latitude, longitude, tags, image_thumb_url, updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                    (
                        payload.get('name'),
                        payload.get('description'),
                        payload.get('address'),
                        payload.get('rating'),
                        payload.get('image_url'),
                        payload.get('category'),
                        payload.get('phone'),
                        payload.get('hours'),
                        payload.get('latitude'),
                        payload.get('longitude'),
                        payload.get('tags'),
                        payload.get('image_thumb_url'),
                        now_ts
                    ))
        new_id = cur.lastrowid
        try:
            cur.execute('UPDATE shops SET position=? WHERE id=? AND position IS NULL', (new_id, new_id))
        except Exception:
            pass
        conn.commit()
        cur.execute('SELECT * FROM shops WHERE id=?', (new_id,))
        row = cur.fetchone()
    except sqlite3.IntegrityError:
        conn.rollback()
        return jsonify({'status':'error','message':'duplicate shop name'}), 409
    finally:
        conn.close()
    shop = serialize_shop_row(row)
    shop['image_variants'] = build_image_variants(shop)
    refresh_bookstore_cache_from_db()
    return jsonify({'status':'success','shop': shop}), 201

@app.route('/api/bookstores/<int:store_id>', methods=['GET','PUT','DELETE'])
def api_bookstore_item(store_id):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute('SELECT * FROM shops WHERE id=?', (store_id,))
        row = cur.fetchone()
        if request.method == 'GET':
            if row:
                shop = serialize_shop_row(row)
                shop['image_variants'] = build_image_variants(shop)
                return jsonify({'status':'success','shop': shop})
            _ensure_store_ids()
            legacy = next((s for s in bookstores if s.get('id') == store_id), None)
            if legacy:
                return jsonify({'status':'success','shop': legacy})
            return jsonify({'status':'error','message':'not found'}), 404
        data = request.get_json(force=True) or {}
        if not has_manager_access(data):
            return jsonify({'status':'error','message':'manager key required'}), 403
        if not row:
            return jsonify({'status':'error','message':'not found'}), 404
        if request.method == 'DELETE':
            cur.execute('DELETE FROM shops WHERE id=?', (store_id,))
            conn.commit()
            refresh_bookstore_cache_from_db()
            return jsonify({'status':'success'})
        payload, errors = parse_bookstore_payload(data, partial=True)
        if errors:
            return jsonify({'status':'error','message':errors[0],'errors':errors}), 400
        if not payload:
            return jsonify({'status':'error','message':'no fields to update'}), 400
        fields = []
        params = []
        for key in ['name','description','address','rating','image_url','category','phone','hours','latitude','longitude','tags','image_thumb_url']:
            if key in payload:
                fields.append(f"{key}=?")
                params.append(payload[key])
        if not fields:
            return jsonify({'status':'error','message':'no fields to update'}), 400
        fields.append("updated_at = datetime('now')")
        params.append(store_id)
        cur.execute(f"UPDATE shops SET {', '.join(fields)} WHERE id=?", tuple(params))
        conn.commit()
        cur.execute('SELECT * FROM shops WHERE id=?', (store_id,))
        updated = cur.fetchone()
    finally:
        conn.close()
    shop = serialize_shop_row(updated)
    shop['image_variants'] = build_image_variants(shop)
    refresh_bookstore_cache_from_db()
    return jsonify({'status':'success','shop': shop})

# nearby using haversine
def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    return R * c

@app.route('/api/bookstores/nearby', methods=['GET'])
def api_nearby():
    lat = request.args.get('lat', type=float)
    lng = request.args.get('lng', type=float)
    radius_km = request.args.get('radius', default=10.0, type=float)
    if lat is None or lng is None:
        return jsonify({'status':'error','message':'lat,lng required'}), 400
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute('SELECT * FROM shops')
        rows = [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()
    res = []
    if rows:
        for row in rows:
            try:
                slat = float(row.get('latitude')) if row.get('latitude') is not None else None
                slng = float(row.get('longitude')) if row.get('longitude') is not None else None
            except (TypeError, ValueError):
                slat = slng = None
            if slat is None or slng is None:
                continue
            d = haversine_km(lat, lng, slat, slng)
            if d <= radius_km:
                shop = serialize_shop_row(row)
                shop['distance_km'] = round(d, 2)
                res.append(shop)
    else:
        _ensure_store_ids()
        for s in bookstores:
            try:
                lat_val = s.get('lat') if s.get('lat') is not None else s.get('latitude')
                lng_val = s.get('lng') if s.get('lng') is not None else s.get('longitude')
                slat = float(lat_val) if lat_val is not None else None
                slng = float(lng_val) if lng_val is not None else None
            except (TypeError, ValueError):
                slat = slng = None
            if slat is None or slng is None:
                continue
            d = haversine_km(lat, lng, slat, slng)
            if d <= radius_km:
                s2 = dict(s)
                s2['distance_km'] = round(d, 2)
                res.append(s2)
    res.sort(key=lambda x: x.get('distance_km', 9999))
    return jsonify({'status':'success','count':len(res),'data':res})

@app.route('/api/bookstores/<path:store_name>/dominant-type', methods=['GET'])
def api_dominant(store_name):
    name = unquote(store_name)
    s = next((x for x in bookstores if (x.get('name') or '').lower() == name.lower()), None)
    if not s:
        return jsonify({'status':'error','message':'not found'}), 404
    books = s.get('books','')
    types = [t.strip() for t in books.split(',') if t.strip()]
    dominant = types[0] if types else 'ทั่วไป'
    return jsonify({'status':'success','type':dominant,'all_types':types})

# -------- Comments (SQLite, JOIN users) --------
@app.route('/api/comments', methods=['GET','POST'])
def api_comments():
    if request.method == 'GET':
        store = request.args.get('store') or request.args.get('store_name')
        shop_id = request.args.get('shop_id', type=int)
        conn = get_db()
        try:
            cur = conn.cursor()
            base_sql = '''SELECT c.id, c.content as text, c.created_at as ts,
                                 u.username as user, c.store_name as store,
                                 c.shop_id, s.name as shop_name, s.rating as shop_rating, u.id as user_id
                          FROM comments c
                          JOIN users u ON u.id=c.user_id
                          LEFT JOIN shops s ON s.id = c.shop_id'''
            where = []
            params = []
            if shop_id is not None:
                where.append('c.shop_id = ?')
                params.append(shop_id)
            elif store:
                where.append('c.store_name = ?')
                params.append(store)
            if where:
                base_sql += ' WHERE ' + ' AND '.join(where)
            base_sql += ' ORDER BY c.id DESC'
            cur.execute(base_sql, tuple(params))
            rows = [dict(r) for r in cur.fetchall()]
            return jsonify({'status':'success','count': len(rows), 'data': rows})
        finally:
            conn.close()
    # POST: require login
    if not session.get('user_id'):
        return jsonify({'status':'error','message':'login required'}), 401
    data = request.get_json(force=True) or {}
    text = sanitize_text(data.get('text'), 2000)
    store = (data.get('store') or data.get('store_name') or '').strip()
    shop_id = data.get('shop_id')
    if not text:
        return jsonify({'status':'error','message':'text required'}), 400
    page_id = ('store:'+store) if store else ('shop:'+str(shop_id)) if shop_id else 'global'
    created = data.get('ts') or datetime.utcnow().isoformat()
    conn = get_db()
    try:
        cur = conn.cursor()
        # If shop_id provided, look up store_name for backward compatibility
        if shop_id and not store:
            cur.execute('SELECT name FROM shops WHERE id=?', (shop_id,))
            r = cur.fetchone()
            store = r['name'] if r else None
        cur.execute('INSERT INTO comments (user_id, page_id, content, store_name, shop_id, created_at) VALUES (?,?,?,?,?,?)',
                    (session['user_id'], page_id, text, (store or None), shop_id, created))
        new_id = cur.lastrowid
        conn.commit()
        return jsonify({'status':'success','data':{
            'id': new_id,
            'store': store or None,
            'shop_id': shop_id,
            'text': text,
            'user': session.get('username') or 'ผู้ใช้',
            'ts': created
        }}), 201
    finally:
        conn.close()

@app.route('/api/comments/<int:comment_id>', methods=['DELETE'])
def api_comment_delete(comment_id):
    me = current_user()
    if not me:
        return jsonify({'status':'error','message':'login required'}), 401
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute('''SELECT c.id, c.store_name as store, c.content as text, c.created_at as ts, u.username as user, u.id as user_id
                       FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=?''', (comment_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({'status':'error','message':'not found'}), 404
        # authorization: owner or admin
        if not (me['is_admin'] or me['id'] == row['user_id']):
            return jsonify({'status':'error','message':'forbidden'}), 403
        cur.execute('DELETE FROM comments WHERE id=?', (comment_id,))
        conn.commit()
        inputs.append({'type':'comment_delete','id':comment_id,'store':row['store'],'user':row['user'],'value':row['text'],'ts': datetime.utcnow().isoformat()})
        save_json(INPUTS_F, inputs)
        return jsonify({'status':'success','data': {'id': row['id'], 'store': row['store'], 'user': row['user'], 'text': row['text'], 'ts': row['ts']}})
    finally:
        conn.close()

@app.route('/api/comments/<int:comment_id>', methods=['PUT'])
def api_comment_update(comment_id):
    me = current_user()
    if not me:
        return jsonify({'status':'error','message':'login required'}), 401
    data = request.get_json(force=True) or {}
    new_text = sanitize_text(data.get('text'), 2000)
    if not new_text:
        return jsonify({'status':'error','message':'text required'}), 400
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute('SELECT user_id FROM comments WHERE id=?', (comment_id,))
        r = cur.fetchone()
        if not r:
            return jsonify({'status':'error','message':'not found'}), 404
        if not (me['is_admin'] or me['id'] == r['user_id']):
            return jsonify({'status':'error','message':'forbidden'}), 403
        cur.execute('UPDATE comments SET content=? WHERE id=?', (new_text, comment_id))
        conn.commit()
        return jsonify({'status':'success'})
    finally:
        conn.close()

# -------- Inputs logging --------
@app.route('/api/inputs', methods=['POST','GET'])
def api_inputs():
    global inputs
    if request.method == 'GET':
        return jsonify({'status':'success','count':len(inputs),'data':inputs})
    data = request.get_json(force=True) or {}
    entry = {
        'type': data.get('type') or 'input',
        'page': data.get('page') or request.headers.get('Referer','') or 'unknown',
        'value': data.get('value') or '',
        'user': data.get('user') or 'ผู้ใช้',
        'ts': datetime.utcnow().isoformat()
    }
    inputs.append(entry)
    save_json(INPUTS_F, inputs)
    return jsonify({'status':'success','data':entry}), 201

if __name__ == '__main__':
    # ensure files exist
    if not os.path.exists(BOOKSTORES_F):
        save_json(BOOKSTORES_F, [])
    if not os.path.exists(INPUTS_F):
        save_json(INPUTS_F, [])
    # init SQLite and migrate legacy comments.json once
    init_db()
    migrate_comments_from_json()
    ensure_schema_upgrades_and_ingest_shops()
    print('Starting server at http://localhost:8080')
    print('Using database file:', DB_PATH)
    app.run(host='0.0.0.0', port=8080, debug=True)
