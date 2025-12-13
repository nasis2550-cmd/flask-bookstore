// server_sqlite.js - Express server using SQLite (website.db) for shops, users, comments
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { getDb, initAndSeed } = require('./website_db');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');

const app = express();
const PORT = process.env.SQLITE_PORT || 3001; // separate port to avoid clash with MySQL server.js
const MANAGER_KEY = process.env.MANAGER_KEY || 'dev-manager';
const UPLOAD_ROOT = path.join(__dirname, 'images', 'uploads');
const PUBLIC_UPLOAD_PREFIX = 'images/uploads';

fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_ROOT),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.webp').toLowerCase();
    const base = slugify(path.basename(file.originalname, ext));
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if(!/^image\//.test(file.mimetype)) return cb(new Error('รองรับเฉพาะไฟล์รูปภาพ (jpg/png/webp)'));
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_secret_sqlite',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function requireManager(req, res, next){
  if(req.session.user && req.session.user.is_admin) return next();
  const headerKey = req.get('x-manager-key');
  const bodyKey = req.body && req.body.manager_key;
  const queryKey = req.query && req.query.manager_key;
  const key = headerKey || bodyKey || queryKey;
  if(key && key === MANAGER_KEY) return next();
  return res.status(403).json({ error: 'Manager key required' });
}

function slugify(input){
  return (input || '')
    .toString()
      .normalize('NFKD')
      .replace(/[^\u0000-\u0E7F\w\s-]/g,'') // keep Thai letters too
    .trim()
    .replace(/\s+/g,'-')
    .replace(/-+/g,'-')
    .slice(0,80)
    .toLowerCase() || 'image';
}

function sanitizeText(value, max = 1000){
  if(value === undefined || value === null) return null;
  const str = String(value).trim();
  if(!str) return null;
  return str.slice(0, max);
}

function parseCoordinate(value, type){
  if(value === undefined || value === null || value === '') return null;
  const num = parseFloat(value);
  if(Number.isNaN(num)) throw new Error(`${type === 'lat' ? 'ละติจูด' : 'ลองจิจูด'} ต้องเป็นตัวเลข`);
  if(type === 'lat' && (num < -90 || num > 90)) throw new Error('ละติจูดต้องอยู่ระหว่าง -90 ถึง 90');
  if(type === 'lng' && (num < -180 || num > 180)) throw new Error('ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180');
  return num;
}

function parseRating(value){
  if(value === undefined || value === null || value === '') return null;
  const num = parseFloat(value);
  if(Number.isNaN(num) || num < 0 || num > 5) throw new Error('คะแนนต้องอยู่ระหว่าง 0-5');
  return num;
}

function normalizeImagePath(p){
  if(!p) return null;
  let cleaned = p.toString().trim();
  cleaned = cleaned.replace(/\\/g,'/');
  cleaned = cleaned.replace(/^\.\//,'');
  return cleaned.startsWith('http') ? cleaned : cleaned.replace(/^\//,'');
}

function haversineKm(lat1, lon1, lat2, lon2){
  if([lat1, lon1, lat2, lon2].some(v => typeof v !== 'number')) return null;
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return +(R * c).toFixed(3);
}

function formatShop(row){
  if(!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    address: row.address,
    phone: row.phone,
    hours: row.hours,
    tags: row.tags,
    rating: row.rating,
    latitude: row.latitude !== null ? Number(row.latitude) : null,
    longitude: row.longitude !== null ? Number(row.longitude) : null,
    image_url: row.image_url,
    image_thumb_url: row.image_thumb_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
    distance_km: row.distance_km ?? null
  };
}

function extractShopPayload(body = {}, { partial = false } = {}){
  try {
    const data = {};
    const nameProvided = body.name !== undefined;
    if(nameProvided || !partial){
      const name = sanitizeText(body.name, 160);
      if(!name) throw new Error('กรุณากรอกชื่อร้าน');
      data.name = name;
    }
    if(body.description !== undefined || !partial){
      data.description = sanitizeText(body.description, 2000);
    }
    if(body.address !== undefined || !partial){
      data.address = sanitizeText(body.address, 800);
    }
    if(body.phone !== undefined || !partial){
      data.phone = sanitizeText(body.phone, 80);
    }
    if(body.hours !== undefined || !partial){
      data.hours = sanitizeText(body.hours, 120);
    }
    if(body.tags !== undefined || body.category !== undefined || body.books !== undefined || !partial){
      const tagSource = body.tags ?? body.category ?? body.books ?? null;
      data.tags = sanitizeText(tagSource, 200);
    }
    const latRaw = body.latitude ?? body.lat;
    if(latRaw !== undefined){
      data.latitude = parseCoordinate(latRaw, 'lat');
    } else if(!partial){
      data.latitude = null;
    }
    const lngRaw = body.longitude ?? body.lng;
    if(lngRaw !== undefined){
      data.longitude = parseCoordinate(lngRaw, 'lng');
    } else if(!partial){
      data.longitude = null;
    }
    if(body.rating !== undefined || !partial){
      data.rating = body.rating !== undefined ? parseRating(body.rating) : null;
    }
    const mainImg = body.image_url ?? body.imageUrl ?? body.image;
    if(mainImg !== undefined || !partial){
      data.image_url = normalizeImagePath(mainImg ?? null);
    }
    const thumbImg = body.image_thumb_url ?? body.imageThumbUrl ?? body.thumbnail;
    if(thumbImg !== undefined || !partial){
      data.image_thumb_url = normalizeImagePath(thumbImg ?? null);
    }
    return { data };
  } catch(err){
    return { error: err.message };
  }
}

async function buildImageVariants(fullPath, baseName){
  const meta = await sharp(fullPath).metadata();
  const targets = [
    { suffix:'lg', width:1600, quality:80 },
    { suffix:'md', width:900, quality:78 },
    { suffix:'sm', width:360, quality:72 }
  ];
  await Promise.all(targets.map(t =>
    sharp(fullPath)
      .rotate()
      .resize({ width: t.width, withoutEnlargement: true })
      .webp({ quality: t.quality })
      .toFile(path.join(UPLOAD_ROOT, `${baseName}-${t.suffix}.webp`))
  ));
  return {
    variants: {
      large: `${PUBLIC_UPLOAD_PREFIX}/${baseName}-lg.webp`,
      medium: `${PUBLIC_UPLOAD_PREFIX}/${baseName}-md.webp`,
      thumb: `${PUBLIC_UPLOAD_PREFIX}/${baseName}-sm.webp`
    },
    metadata: meta
  };
}

function listStoredImageVariants(shop){
  const list = [];
  if(shop.image_url) list.push({ type:'main', url: shop.image_url });
  if(shop.image_thumb_url) list.push({ type:'thumb', url: shop.image_thumb_url });
  return list;
}

// Initialize + seed shops on startup
initAndSeed().then(() => {
  console.log('SQLite database initialized & shops seeded (if any).');
}).catch(e => console.error('Init error', e));

// Validation helpers
function validateUsername(u){ return typeof u === 'string' && /^[A-Za-z0-9_]{3,32}$/.test(u); }
function validateEmail(e){ return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function validatePassword(p){ return typeof p === 'string' && p.length >= 6 && p.length <= 100; }
function validateContent(c){ return typeof c === 'string' && c.trim().length > 0 && c.length <= 2000; }

function requireAdmin(req,res,next){
  if(!req.session.user || !req.session.user.is_admin) return res.status(403).json({ error:'Admin only' });
  next();
}

// Helper to log login attempts
function logLoginAttempt({ userId=null, username, success, ip, ua }){
  try {
    const db = getDb();
    const stmt = db.prepare('INSERT INTO login_events (user_id, username, success, ip, user_agent) VALUES (?,?,?,?,?)');
    stmt.run(userId, username, success ? 1 : 0, ip, ua, ()=>{
      stmt.finalize(); db.close();
    });
  } catch(e){ console.error('Login log error', e); }
}

// REGISTER (prefixed and unprefixed)
app.post(['/api/sqlite/register','/api/register'], async (req, res) => {
  const { username, email, password } = req.body;
  if (!validateUsername(username) || !validateEmail(email) || !validatePassword(password)) return res.status(400).json({ error: 'Invalid input' });
  const db = getDb();
  try {
    const hash = await bcrypt.hash(password, 12);
    db.serialize(()=>{
      const userStmt = db.prepare('INSERT INTO users (username, email, password_hash, email_verified) VALUES (?,?,?,0)');
      userStmt.run(username, email, hash, function(err){
        if (err) {
          if (/(UNIQUE)/.test(err.message)) { userStmt.finalize(); db.close(); return res.status(409).json({ error: 'Username or email already exists' }); }
          console.error(err); userStmt.finalize(); db.close(); return res.status(500).json({ error: 'Server error' });
        }
        const newUserId = this.lastID;
        userStmt.finalize();
        // create verification token (24h expiry)
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24*60*60*1000).toISOString();
        const vStmt = db.prepare('INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?,?,?)');
        vStmt.run(newUserId, token, expiresAt, function(vErr){
          vStmt.finalize();
          db.close();
          if(vErr){ console.error(vErr); return res.json({ message:'Registered (verification token failed)', id:newUserId }); }
          // Return token directly (dev mode); in production you would send email
          res.json({ message:'Registered', id:newUserId, verification_token: token, verification_expires: expiresAt });
        });
      });
    });
  } catch (e) {
    console.error(e); db.close(); res.status(500).json({ error: 'Server error' });
  }
});

// LOGIN (prefixed and unprefixed)
app.post(['/api/sqlite/login','/api/login'], async (req, res) => {
  // Accept either username OR email in a single field (username, email, or user)
  const identifier = (req.body.username || req.body.email || req.body.user || '').trim();
  const password = req.body.password;
  const ip = req.ip; const ua = req.headers['user-agent'] || '';
  if(!password){ logLoginAttempt({ username: identifier, success:false, ip, ua }); return res.status(400).json({ error:'Password required' }); }
  const isIdEmail = /@/.test(identifier);
  // Basic validation depending on format
  if( (isIdEmail && !validateEmail(identifier)) || (!isIdEmail && !validateUsername(identifier)) || !validatePassword(password) ){
    logLoginAttempt({ username: identifier, success:false, ip, ua });
    return res.status(400).json({ error:'Invalid credentials' });
  }
  const db = getDb();
  const sql = isIdEmail ? 'SELECT id, username, email, password_hash, is_admin, email_verified FROM users WHERE email = ?' : 'SELECT id, username, email, password_hash, is_admin, email_verified FROM users WHERE username = ?';
  db.get(sql, [identifier], async (err, row) => {
    if (err) { console.error(err); db.close(); logLoginAttempt({ username: identifier, success:false, ip, ua }); return res.status(500).json({ error: 'Server error' }); }
    if (!row) { db.close(); logLoginAttempt({ username: identifier, success:false, ip, ua }); return res.status(401).json({ error: 'Invalid credentials' }); }
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) { db.close(); logLoginAttempt({ userId:row.id, username: row.username, success:false, ip, ua }); return res.status(401).json({ error: 'Invalid credentials' }); }
    req.session.user = { id: row.id, username: row.username, email: row.email, is_admin: !!row.is_admin };
    // Auto-create verification token on login if still unverified and no active token
    const loginStamp = new Date().toISOString();
    if(!row.email_verified){
      db.get('SELECT token FROM email_verifications WHERE user_id = ? AND used_at IS NULL AND expires_at > ?', [row.id, new Date().toISOString()], (e2, tokRow)=>{
        if(e2){ /* ignore */ }
        if(!tokRow){
          const token = crypto.randomBytes(32).toString('hex');
          const expiresAt = new Date(Date.now() + 24*60*60*1000).toISOString();
          const ins = db.prepare('INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?,?,?)');
          ins.run(row.id, token, expiresAt, ()=> ins.finalize());
          // also log a synthetic row marking this login (mark used immediately so it won't appear as pending)
          const loginToken = 'login_'+crypto.randomBytes(16).toString('hex');
          const insLogin = db.prepare('INSERT INTO email_verifications (user_id, token, expires_at, used_at) VALUES (?,?,?,?)');
          insLogin.run(row.id, loginToken, loginStamp, loginStamp, ()=> insLogin.finalize());
          logLoginAttempt({ userId:row.id, username: row.username, success:true, ip, ua });
          db.close();
          return res.json({ message:'Logged in (verification pending)', user:{...req.session.user}, email_verified:false, verification_token: token, verification_expires: expiresAt });
        } else {
          // still add a used login marker row so table not empty
          const loginToken = 'login_'+crypto.randomBytes(16).toString('hex');
          const insLogin = db.prepare('INSERT INTO email_verifications (user_id, token, expires_at, used_at) VALUES (?,?,?,?)');
          insLogin.run(row.id, loginToken, loginStamp, loginStamp, ()=> insLogin.finalize());
          logLoginAttempt({ userId:row.id, username: row.username, success:true, ip, ua });
          db.close();
          return res.json({ message:'Logged in (verification pending)', user:{...req.session.user}, email_verified:false });
        }
      });
    } else {
      // verified users also get a used login marker row
      const loginToken = 'login_'+crypto.randomBytes(16).toString('hex');
      const insLogin = db.prepare('INSERT INTO email_verifications (user_id, token, expires_at, used_at) VALUES (?,?,?,?)');
      insLogin.run(row.id, loginToken, loginStamp, loginStamp, ()=> insLogin.finalize());
      logLoginAttempt({ userId:row.id, username: row.username, success:true, ip, ua });
      db.close();
      res.json({ message:'Logged in', user: { ...req.session.user }, email_verified: true });
    }
  });
});

// LOGOUT
app.post(['/api/sqlite/logout','/api/logout'], (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out' }));
});

// ME endpoint
app.get(['/api/sqlite/me','/api/me'], (req,res)=>{
  if(!req.session.user) return res.json({ authenticated:false });
  // fetch email_verified status
  const db = getDb();
  db.get('SELECT email_verified FROM users WHERE id = ?', [req.session.user.id], (err,row)=>{
    db.close();
    if(err || !row) return res.json({ authenticated:true, user:req.session.user, email_verified:false });
    res.json({ authenticated:true, user:req.session.user, email_verified: !!row.email_verified });
  });
});
// Verify email endpoint
app.get(['/api/sqlite/verify-email','/api/verify-email'], (req,res)=>{
  const { token } = req.query;
  if(!token) return res.status(400).json({ error:'Token required' });
  const db = getDb();
  db.get('SELECT id, user_id, expires_at, used_at FROM email_verifications WHERE token = ?', [token], (err,row)=>{
    if(err){ db.close(); return res.status(500).json({ error:'Server error' }); }
    if(!row) { db.close(); return res.status(404).json({ error:'Token not found' }); }
    if(row.used_at){ db.close(); return res.status(400).json({ error:'Token already used' }); }
    if(new Date(row.expires_at) < new Date()) { db.close(); return res.status(400).json({ error:'Token expired' }); }
    const now = new Date().toISOString();
    const upd1 = db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?');
    upd1.run(row.user_id, (e1)=>{
      upd1.finalize();
      if(e1){ db.close(); return res.status(500).json({ error:'Server error' }); }
      const upd2 = db.prepare('UPDATE email_verifications SET used_at = ? WHERE id = ?');
      upd2.run(now, row.id, (e2)=>{
        upd2.finalize(); db.close();
        if(e2){ return res.status(500).json({ error:'Server error' }); }
        res.json({ message:'Email verified' });
      });
    });
  });
});

// Resend verification (requires auth & not verified)
app.post(['/api/sqlite/resend-verification','/api/resend-verification'], requireAuth, (req,res)=>{
  const db = getDb();
  db.get('SELECT id, email_verified FROM users WHERE id = ?', [req.session.user.id], (err,row)=>{
    if(err || !row){ db.close(); return res.status(500).json({ error:'Server error' }); }
    if(row.email_verified){ db.close(); return res.status(400).json({ error:'Already verified' }); }
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24*60*60*1000).toISOString();
    const stmt = db.prepare('INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?,?,?)');
    stmt.run(row.id, token, expiresAt, (e2)=>{
      stmt.finalize(); db.close();
      if(e2){ return res.status(500).json({ error:'Server error' }); }
      res.json({ message:'Token generated', verification_token: token, verification_expires: expiresAt });
    });
  });
});

// Admin list/delete users
app.get(['/api/sqlite/users','/api/users'], requireAuth, requireAdmin, (req,res)=>{
  const db = getDb();
  db.all('SELECT id, username, email, is_admin, created_at FROM users ORDER BY id DESC', [], (err, rows)=>{
    db.close();
    if(err) return res.status(500).json({ error:'Server error' });
    res.json(rows);
  });
});
app.delete(['/api/sqlite/users/:id','/api/users/:id'], requireAuth, requireAdmin, (req,res)=>{
  const { id } = req.params;
  const db = getDb();
  const stmt = db.prepare('DELETE FROM users WHERE id = ?');
  stmt.run(id, function(err){
    stmt.finalize(); db.close();
    if(err) return res.status(500).json({ error:'Server error' });
    res.json({ deleted:this.changes });
  });
});

// Admin pending verifications
app.get(['/api/sqlite/admin/pending-verifications','/api/admin/pending-verifications'], requireAuth, requireAdmin, (req,res)=>{
  const db = getDb();
  const sql = `SELECT u.id as user_id, u.username, u.email, u.created_at,
    v.token, v.expires_at, v.used_at
    FROM users u LEFT JOIN email_verifications v
    ON v.user_id = u.id AND v.used_at IS NULL
    WHERE u.email_verified = 0
    ORDER BY u.created_at DESC`;
  db.all(sql, [], (err, rows)=>{
    db.close();
    if(err) return res.status(500).json({ error:'Server error' });
    res.json(rows.map(r=>({
      user_id: r.user_id,
      username: r.username,
      email: r.email,
      created_at: r.created_at,
      token: r.token || null,
      expires_at: r.expires_at || null
    })));
  });
});

// LIST SHOPS / BOOKSTORES WITH SORTING + DISTANCE
app.get([
  '/api/sqlite/bookstores',
  '/api/bookstores',
  '/api/sqlite/shops',
  '/api/shops'
], (req, res) => {
  const sortKey = (req.query.sort || '').toString().toLowerCase();
  const latParam = req.query.lat ?? req.query.latitude;
  const lngParam = req.query.lng ?? req.query.longitude;
  const limitParam = req.query.limit;
  const radiusParam = req.query.radius;
  const latNum = latParam !== undefined ? parseFloat(latParam) : null;
  const lngNum = lngParam !== undefined ? parseFloat(lngParam) : null;
  const validCoords = latNum !== null && !Number.isNaN(latNum) && lngNum !== null && !Number.isNaN(lngNum);
  const limitNum = limitParam !== undefined ? parseInt(limitParam, 10) : null;
  const radiusNum = radiusParam !== undefined ? parseFloat(radiusParam) : null;

  const db = getDb();
  db.all(
    'SELECT id, name, description, address, phone, hours, tags, rating, latitude, longitude, image_url, image_thumb_url, created_at, updated_at FROM shops',
    [],
    (err, rows) => {
      db.close();
      if (err) { console.error(err); return res.status(500).json({ error: 'Server error' }); }
      let list = rows.map(formatShop);
      if(validCoords){
        list = list.map(row => ({
          ...row,
          distance_km: row.latitude !== null && row.longitude !== null ? haversineKm(latNum, lngNum, row.latitude, row.longitude) : null
        }));
      }

      switch(sortKey){
        case 'distance':
          if(validCoords){
            list = list.filter(r => typeof r.distance_km === 'number').sort((a,b) => a.distance_km - b.distance_km);
          }
          break;
        case 'latest':
          list = list.sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
          break;
        case 'rating':
          list = list.sort((a,b) => (b.rating ?? 0) - (a.rating ?? 0));
          break;
        default:
          list = list.sort((a,b) => (a.name || '').localeCompare(b.name || '', 'th')); 
      }

      if(validCoords && radiusNum && !Number.isNaN(radiusNum) && radiusNum > 0){
        list = list.filter(r => typeof r.distance_km === 'number' && r.distance_km <= radiusNum);
      }

      if(limitNum && !Number.isNaN(limitNum) && limitNum > 0){
        list = list.slice(0, limitNum);
      }

      res.json(list);
    }
  );
});

app.get(['/api/sqlite/bookstores/nearby','/api/bookstores/nearby'], (req,res)=>{
  const lat = parseFloat(req.query.lat ?? req.query.latitude);
  const lng = parseFloat(req.query.lng ?? req.query.longitude);
  if(Number.isNaN(lat) || Number.isNaN(lng)){
    return res.status(400).json({ error:'ต้องระบุ lat และ lng' });
  }
  const radius = req.query.radius ? parseFloat(req.query.radius) : 10;
  const db = getDb();
  db.all('SELECT id, name, description, address, phone, hours, tags, rating, latitude, longitude, image_url, image_thumb_url, created_at, updated_at FROM shops', [], (err, rows)=>{
    db.close();
    if(err){ console.error(err); return res.status(500).json({ error:'Server error' }); }
    const within = rows
      .map(formatShop)
      .map(row => ({...row, distance_km: row.latitude !== null && row.longitude !== null ? haversineKm(lat, lng, row.latitude, row.longitude) : null}))
      .filter(row => typeof row.distance_km === 'number' && (Number.isNaN(radius) || radius <= 0 || row.distance_km <= radius))
      .sort((a,b)=> a.distance_km - b.distance_km);
    res.json(within);
  });
});

// CREATE BOOKSTORE (auto provision user if needed)
app.post([
  '/api/sqlite/bookstores',
  '/api/bookstores',
  '/api/sqlite/shops',
  '/api/shops'
], (req,res)=>{
  const { data, error } = extractShopPayload(req.body || {});
  if(error) return res.status(400).json({ error });
  const payload = {
    name: data.name,
    description: data.description ?? null,
    address: data.address ?? null,
    phone: data.phone ?? null,
    hours: data.hours ?? null,
    tags: data.tags ?? null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    rating: data.rating ?? null,
    image_url: data.image_url ?? null,
    image_thumb_url: data.image_thumb_url ?? null
  };
  const usernameHint = (req.body && (req.body.username || req.body.user)) || 'guest';

  const ensureUser = new Promise((resolve, reject) => {
    if(req.session.user) return resolve();
    const candidate = (usernameHint || '').trim() || 'guest';
    const uname = validateUsername(candidate) ? candidate : ('guest_'+Math.random().toString(36).slice(2,7));
    const email = `${uname}@local`;
    const dbProv = getDb();
    dbProv.get('SELECT id, username, email, is_admin FROM users WHERE username = ?', [uname], (err,row)=>{
      if(err){ dbProv.close(); return reject(err); }
      if(row){
        req.session.user = { id: row.id, username: row.username, email: row.email, is_admin: !!row.is_admin };
        dbProv.close();
        return resolve();
      }
      const hash = bcrypt.hashSync('local_'+crypto.randomBytes(16).toString('hex'), 10);
      const ins = dbProv.prepare('INSERT INTO users (username, email, password_hash, is_admin, email_verified) VALUES (?,?,?,?,1)');
      ins.run(uname, email, hash, 0, function(e2){
        ins.finalize();
        if(e2){ dbProv.close(); return reject(e2); }
        req.session.user = { id: this.lastID, username: uname, email, is_admin: false };
        dbProv.close();
        resolve();
      });
    });
  });

  ensureUser.then(()=>{
    const db = getDb();
    const stmt = db.prepare('INSERT INTO shops (name, description, address, phone, hours, tags, latitude, longitude, rating, image_url, image_thumb_url) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    stmt.run(
      payload.name,
      payload.description,
      payload.address,
      payload.phone,
      payload.hours,
      payload.tags,
      payload.latitude,
      payload.longitude,
      payload.rating,
      payload.image_url,
      payload.image_thumb_url,
      function(err){
        stmt.finalize();
        if(err){
          db.close();
          if(/UNIQUE/.test(err.message)) return res.status(409).json({ error:'Shop name exists' });
          console.error(err); return res.status(500).json({ error:'Server error' });
        }
        const newId = this.lastID;
        db.get('SELECT id, name, description, address, phone, hours, tags, rating, latitude, longitude, image_url, image_thumb_url, created_at, updated_at FROM shops WHERE id = ?', [newId], (e2,row)=>{
          db.close();
          if(e2 || !row) return res.status(500).json({ error:'Server error' });
          res.json(formatShop(row));
        });
      }
    );
  }).catch(err => {
    console.error('Provision failed', err);
    res.status(500).json({ error:'Provision failed' });
  });
});

app.post(['/api/sqlite/bookstores/upload','/api/bookstores/upload'], (req,res)=>{
  upload.single('image')(req,res, async err => {
    if(err){
      console.error('Upload error', err);
      return res.status(400).json({ error: err.message || 'อัปโหลดไม่สำเร็จ' });
    }
    if(!req.file) return res.status(400).json({ error:'ไม่พบไฟล์' });
    try{
      const base = path.basename(req.file.filename, path.extname(req.file.filename));
      const { variants, metadata } = await buildImageVariants(req.file.path, base);
      res.json({
        message:'uploaded',
        original: `${PUBLIC_UPLOAD_PREFIX}/${req.file.filename}`,
        variants,
        width: metadata.width,
        height: metadata.height
      });
    }catch(e){
      console.error('Process image error', e);
      res.status(500).json({ error:'ประมวลผลรูปภาพไม่สำเร็จ' });
    }
  });
});

// UPDATE SHOP (requires admin session or manager key)
app.put([
  '/api/sqlite/bookstores/:id',
  '/api/bookstores/:id',
  '/api/sqlite/shops/:id',
  '/api/shops/:id'
], requireManager, (req,res)=>{
  const { id } = req.params;
  const { data, error } = extractShopPayload(req.body || {}, { partial: true });
  if(error) return res.status(400).json({ error });
  const entries = Object.entries(data);
  if(entries.length === 0) return res.status(400).json({ error:'No fields to update' });
  const db = getDb();
  db.get('SELECT id FROM shops WHERE id = ?', [id], (e,row)=>{
    if(e){ db.close(); return res.status(500).json({ error:'Server error' }); }
    if(!row){ db.close(); return res.status(404).json({ error:'Not found' }); }
    const fields = entries.map(([key]) => `${key} = ?`);
    const params = entries.map(([,value]) => value ?? null);
    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    const stmt = db.prepare(`UPDATE shops SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(params, function(err){
      stmt.finalize();
      if(err){
        if(/UNIQUE/.test(err.message)){ db.close(); return res.status(409).json({ error:'Name exists' }); }
        console.error(err); db.close(); return res.status(500).json({ error:'Server error' });
      }
      db.get('SELECT id, name, description, address, phone, hours, tags, rating, latitude, longitude, image_url, image_thumb_url, created_at, updated_at FROM shops WHERE id = ?', [id], (e2,row2)=>{
        db.close();
        if(e2||!row2) return res.status(500).json({ error:'Server error' });
        res.json(formatShop(row2));
      });
    });
  });
});

// DELETE SHOP (manager only)
app.delete([
  '/api/sqlite/bookstores/:id',
  '/api/bookstores/:id',
  '/api/sqlite/shops/:id',
  '/api/shops/:id'
], requireManager, (req,res)=>{
  const { id } = req.params;
  const db = getDb();
  const stmt = db.prepare('DELETE FROM shops WHERE id = ?');
  stmt.run(id, function(err){
    stmt.finalize();
    db.close();
    if(err){ console.error(err); return res.status(500).json({ error:'Server error' }); }
    res.json({ deleted: this.changes });
  });
});

// SHOP DETAIL + COMMENTS
app.get([
  '/api/sqlite/bookstores/:id',
  '/api/bookstores/:id',
  '/api/sqlite/shops/:id',
  '/api/shops/:id'
], (req, res) => {
  const { id } = req.params;
  const db = getDb();
  db.get('SELECT id, name, description, address, phone, hours, tags, rating, latitude, longitude, image_url, image_thumb_url, created_at, updated_at FROM shops WHERE id = ?', [id], (err, shop) => {
    if (err) { console.error(err); db.close(); return res.status(500).json({ error: 'Server error' }); }
    if (!shop) { db.close(); return res.status(404).json({ error: 'Shop not found' }); }
    const formatted = formatShop(shop);
    const imageVariants = listStoredImageVariants(formatted);
    db.all('SELECT c.id, c.content, c.created_at, u.username FROM comments c JOIN users u ON c.user_id = u.id WHERE c.shop_id = ? ORDER BY c.created_at DESC', [id], (err2, comments) => {
      db.close();
      if (err2) { console.error(err2); return res.status(500).json({ error: 'Server error' }); }
      res.json({ shop: { ...formatted, image_variants: imageVariants }, comments });
    });
  });
});

// CREATE COMMENT
app.post(['/api/sqlite/shops/:id/comments','/api/shops/:id/comments'], requireAuth, (req, res) => {
  const { id } = req.params; // shop id
  const { content } = req.body;
  if (!validateContent(content)) return res.status(400).json({ error: 'Content required' });
  const db = getDb();
  db.get('SELECT id FROM shops WHERE id = ?', [id], (err, shop) => {
    if (err) { console.error(err); db.close(); return res.status(500).json({ error: 'Server error' }); }
    if (!shop) { db.close(); return res.status(404).json({ error: 'Shop not found' }); }
    const stmt = db.prepare('INSERT INTO comments (shop_id, user_id, content) VALUES (?,?,?)');
    stmt.run(id, req.session.user.id, content, function(err2){
      if (err2) { console.error(err2); db.close(); return res.status(500).json({ error: 'Server error' }); }
      const commentId = this.lastID;
      stmt.finalize();
      db.get('SELECT c.id, c.content, c.created_at, u.username FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?', [commentId], (err3, row) => {
        db.close();
        if (err3) { console.error(err3); return res.status(500).json({ error: 'Server error' }); }
        res.json(row);
      });
    });
  });
});

// EDIT COMMENT
app.put(['/api/sqlite/comments/:id','/api/comments/:id'], requireAuth, (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  if (!validateContent(content)) return res.status(400).json({ error: 'Content required' });
  const db = getDb();
  db.get('SELECT id, user_id FROM comments WHERE id = ?', [id], (err, row) => {
    if (err) { console.error(err); db.close(); return res.status(500).json({ error: 'Server error' }); }
    if (!row) { db.close(); return res.status(404).json({ error: 'Comment not found' }); }
    if (row.user_id !== req.session.user.id) { db.close(); return res.status(403).json({ error: 'Forbidden' }); }
    const stmt = db.prepare('UPDATE comments SET content = ? WHERE id = ?');
    stmt.run(content, id, function(err2){
      stmt.finalize();
      db.close();
      if (err2) { console.error(err2); return res.status(500).json({ error: 'Server error' }); }
      res.json({ message: 'Updated' });
    });
  });
});

// DELETE COMMENT
app.delete(['/api/sqlite/comments/:id','/api/comments/:id'], requireAuth, (req, res) => {
  const { id } = req.params;
  const db = getDb();
  db.get('SELECT id, user_id FROM comments WHERE id = ?', [id], (err, row) => {
    if (err) { console.error(err); db.close(); return res.status(500).json({ error: 'Server error' }); }
    if (!row) { db.close(); return res.status(404).json({ error: 'Comment not found' }); }
    if (row.user_id !== req.session.user.id && !req.session.user.is_admin) { db.close(); return res.status(403).json({ error: 'Forbidden' }); }
    const stmt = db.prepare('DELETE FROM comments WHERE id = ?');
    stmt.run(id, function(err2){
      stmt.finalize();
      db.close();
      if (err2) { console.error(err2); return res.status(500).json({ error: 'Server error' }); }
      res.json({ message: 'Deleted' });
    });
  });
});

// LIST ALL COMMENTS (joined) + CREATE general comment
app.get(['/api/sqlite/comments','/api/comments'], (req,res)=>{
  const db = getDb();
  db.all('SELECT c.id, c.content, c.created_at, c.shop_id, c.store_name, c.page_id, u.username, s.name AS shop_name FROM comments c JOIN users u ON c.user_id = u.id LEFT JOIN shops s ON c.shop_id = s.id ORDER BY c.created_at DESC', [], (err, rows)=>{
    db.close();
    if(err) return res.status(500).json({ error:'Server error' });
    res.json(rows.map(r=> ({
      id:r.id,
      content:r.content,
      created_at:r.created_at,
      shop_id:r.shop_id,
      shop_name:r.shop_name || r.store_name || null,
      store_name:r.store_name || r.shop_name || null,
      page_id: r.page_id || null,
      username:r.username
    })));
  });
});
app.post(['/api/sqlite/comments','/api/comments'], (req,res)=>{
  // Flexible body: { content } or { text } and optional { shop_id } or { store }.
  let { content, text, shop_id, store, store_name, page_id, username, user } = req.body;
  if(!content && text) content = text;
  if(!validateContent(content)) return res.status(400).json({ error:'Content required' });
  // Auto-provision user if no session (guest mode)
  if(!req.session.user){
    const candidate = (username || user || '').trim() || 'guest';
    const uname = validateUsername(candidate) ? candidate : ('guest_'+Math.random().toString(36).slice(2,7));
    const email = uname + '@local';
    const dbProv = getDb();
    dbProv.get('SELECT id, username, email, is_admin FROM users WHERE username = ?', [uname], (err,row)=>{
      if(err){ console.error(err); }
      if(row){
        req.session.user = { id: row.id, username: row.username, email: row.email, is_admin: !!row.is_admin };
        dbProv.close();
        return proceedInsert();
      }
      const hash = bcrypt.hashSync('local_'+crypto.randomBytes(16).toString('hex'), 10);
      const ins = dbProv.prepare('INSERT INTO users (username, email, password_hash, is_admin, email_verified) VALUES (?,?,?,?,1)');
      ins.run(uname, email, hash, 0, function(e2){
        ins.finalize();
        if(e2){ console.error(e2); dbProv.close(); return res.status(500).json({ error:'Provision failed' }); }
        req.session.user = { id: this.lastID, username: uname, email, is_admin: false };
        dbProv.close();
        proceedInsert();
      });
    });
  } else {
    proceedInsert();
  }

  function proceedInsert(){
    if(!req.session.user) return res.status(500).json({ error:'No user' });
    const db = getDb();
    function insertRow(resolvedShopId){
      const stmt = db.prepare('INSERT INTO comments (shop_id, user_id, content, store_name, page_id) VALUES (?,?,?,?,?)');
      stmt.run(resolvedShopId || null, req.session.user.id, content, store || store_name || null, page_id || null, function(err){
        if(err){ console.error(err); stmt.finalize(); db.close(); return res.status(500).json({ error:'Server error' }); }
        const newId = this.lastID;
        stmt.finalize();
        db.get('SELECT c.id, c.content, c.created_at, c.shop_id, c.store_name, c.page_id, u.username, s.name AS shop_name FROM comments c JOIN users u ON c.user_id = u.id LEFT JOIN shops s ON c.shop_id = s.id WHERE c.id = ?', [newId], (err2,row)=>{
          db.close();
          if(err2){ console.error(err2); return res.status(500).json({ error:'Server error' }); }
          res.json({
            id: row.id,
            content: row.content,
            created_at: row.created_at,
            shop_id: row.shop_id,
            shop_name: row.shop_name || row.store_name,
            store_name: row.store_name || row.shop_name,
            page_id: row.page_id,
            username: row.username
          });
        });
      });
    }
    if(shop_id){
      insertRow(shop_id);
    } else if(store){
      db.get('SELECT id FROM shops WHERE name = ?', [store], (e,srow)=>{
        if(e){ console.error(e); }
        insertRow(srow? srow.id : null);
      });
    } else {
      insertRow(null);
    }
  }
});

// Admin view of login events
app.get(['/api/sqlite/admin/login-events','/api/admin/login-events'], requireAuth, requireAdmin, (req,res)=>{
  const { username, limit } = req.query;
  const lim = Math.min(parseInt(limit||'200',10), 1000);
  const db = getDb();
  let sql = 'SELECT id, user_id, username, success, ip, user_agent, created_at FROM login_events';
  const params = [];
  if(username){ sql += ' WHERE username = ?'; params.push(username); }
  sql += ' ORDER BY id DESC LIMIT ?'; params.push(lim);
  db.all(sql, params, (err, rows)=>{
    db.close();
    if(err) return res.status(500).json({ error:'Server error' });
    res.json(rows.map(r=> ({
      id:r.id,
      user_id:r.user_id,
      username:r.username,
      success: !!r.success,
      ip:r.ip,
      user_agent:r.user_agent,
      created_at:r.created_at
    })));
  });
});

// Admin: list email_verifications (tokens + login markers)
app.get(['/api/sqlite/admin/verifications','/api/admin/verifications'], requireAuth, requireAdmin, (req,res)=>{
  const { user, pending } = req.query;
  const db = getDb();
  let sql = `SELECT v.id, v.user_id, u.username, u.email, v.token, v.expires_at, v.used_at, v.created_at
             FROM email_verifications v JOIN users u ON v.user_id = u.id`;
  const params = [];
  const where = [];
  if(user){ where.push('(u.username = ? OR u.email = ?)'); params.push(user, user); }
  if(pending==='1'){ where.push('v.used_at IS NULL'); }
  if(where.length){ sql += ' WHERE ' + where.join(' AND '); }
  sql += ' ORDER BY v.id DESC LIMIT 500';
  db.all(sql, params, (err, rows)=>{
    db.close();
    if(err) return res.status(500).json({ error:'Server error' });
    res.json(rows.map(r=> ({
      id:r.id,
      user_id:r.user_id,
      username:r.username,
      email:r.email,
      token:r.token,
      expires_at:r.expires_at,
      used_at:r.used_at,
      created_at:r.created_at
    })));
  });
});

// Simple inputs endpoint to avoid UI warning (no-op log storage for now)
app.get(['/api/sqlite/inputs','/api/inputs'], (req,res)=>{
  res.json([]);
});

app.listen(PORT, () => {
  console.log('==============================================');
  console.log(`SQLite server running at http://localhost:${PORT}`);
  console.log('Open pages via the server (not file:///):');
  console.log(`  - Admin:   http://localhost:${PORT}/admin.html`);
  console.log(`  - Home:    http://localhost:${PORT}/home.html`);
  console.log(`  - Comments:http://localhost:${PORT}/Comment.html`);
  console.log('APIs:');
  console.log(`  GET  /api/shops        -> list shops`);
  console.log(`  POST /api/shops        -> create shop`);
  console.log(`  PUT  /api/shops/:id    -> update shop (admin)`);
  console.log(`  DELETE /api/shops/:id  -> delete shop (admin)`);
  console.log(`  GET  /api/comments     -> list comments`);
  console.log(`  POST /api/comments     -> create comment`);
  console.log('==============================================');
});

// Record a local login into email_verifications (and provision user if needed)
app.post(['/api/sqlite/local-login','/api/local-login'], (req,res)=>{
  let { identifier, username, email, display_name } = req.body || {};
  identifier = (identifier || username || email || '').trim();
  if(!identifier){ return res.status(400).json({ error:'identifier required' }); }
  const isEmail = /@/.test(identifier);
  let uname = identifier;
  let mail = identifier;
  if(isEmail){
    if(!validateEmail(mail)) return res.status(400).json({ error:'invalid email' });
    const base = (identifier.split('@')[0] || 'user').replace(/[^A-Za-z0-9_]/g,'_').slice(0,32) || 'user';
    uname = validateUsername(base) ? base : ('user_'+Math.random().toString(36).slice(2,7));
  } else {
    if(!validateUsername(uname)) uname = ('user_'+Math.random().toString(36).slice(2,7));
    mail = `${uname}@local`;
  }
  const db = getDb();
  db.get('SELECT id, username, email, is_admin FROM users WHERE username = ? OR email = ? LIMIT 1', [uname, mail], (err,row)=>{
    if(err){ db.close(); return res.status(500).json({ error:'Server error' }); }
    const done = (userRow)=>{
      req.session.user = { id:userRow.id, username:userRow.username, email:userRow.email, is_admin: !!userRow.is_admin };
      const now = new Date().toISOString();
      const token = 'login_'+crypto.randomBytes(16).toString('hex');
      const ins = db.prepare('INSERT INTO email_verifications (user_id, token, expires_at, used_at) VALUES (?,?,?,?)');
      ins.run(userRow.id, token, now, now, function(e2){
        ins.finalize(); db.close();
        if(e2){ return res.status(500).json({ error:'Server error' }); }
        res.json({ message:'logged', user:req.session.user });
      });
    };
    if(row){ return done(row); }
    // create new user
    const hash = bcrypt.hashSync('local_'+crypto.randomBytes(16).toString('hex'), 10);
    const name = display_name && String(display_name).trim() ? String(display_name).trim().slice(0,48) : uname;
    const insUser = db.prepare('INSERT INTO users (username, email, password_hash, is_admin, email_verified) VALUES (?,?,?,?,1)');
    insUser.run(uname, mail, hash, 0, function(e3){
      insUser.finalize();
      if(e3){ db.close(); return res.status(500).json({ error:'Server error' }); }
      done({ id:this.lastID, username:uname, email:mail, is_admin:0 });
    });
  });
});
