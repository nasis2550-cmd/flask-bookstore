// website_db.js - SQLite main database (website.db)
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const cheerio = require('cheerio');

const DB_PATH = path.join(__dirname, 'website.db');
const SCHEMA = path.join(__dirname, 'schema_website.sql');
const HOME_HTML = path.join(__dirname, 'home.html');

function getDb() {
  return new sqlite3.Database(DB_PATH);
}

function runSchema(db) {
  const sql = fs.readFileSync(SCHEMA, 'utf8');
  sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean).forEach(stmt => {
    if(!stmt) return;
    db.run(stmt + ';');
  });
  // migrations
    db.all('PRAGMA table_info(shops)', (err, cols) => {
      if(err) return;
      const has = name => cols.some(c => c.name === name);
      if(!has('phone')) db.run('ALTER TABLE shops ADD COLUMN phone TEXT');
      if(!has('hours')) db.run('ALTER TABLE shops ADD COLUMN hours TEXT');
      if(!has('tags')) db.run('ALTER TABLE shops ADD COLUMN tags TEXT');
      if(!has('latitude')) db.run('ALTER TABLE shops ADD COLUMN latitude REAL');
      if(!has('longitude')) db.run('ALTER TABLE shops ADD COLUMN longitude REAL');
      if(!has('image_thumb_url')) db.run('ALTER TABLE shops ADD COLUMN image_thumb_url TEXT');
      if(!has('updated_at')) db.run('ALTER TABLE shops ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    });
  db.get("PRAGMA table_info(users)", (err,row)=>{}); // force pragma load
  db.all("PRAGMA table_info(users)", (err, cols) => {
    if(!err){
      const hasAdmin = cols.some(c => c.name === 'is_admin');
      if(!hasAdmin){
        db.run('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
      }
    }
  });
  db.all("PRAGMA table_info(comments)", (err, cols) => {
    if(!err){
      const hasShop = cols.some(c => c.name === 'shop_id');
      if(!hasShop){
        db.run('ALTER TABLE comments ADD COLUMN shop_id INTEGER REFERENCES shops(id)');
      }
      const hasStoreName = cols.some(c => c.name === 'store_name');
      if(!hasStoreName){
        db.run('ALTER TABLE comments ADD COLUMN store_name TEXT');
      }
      const hasPageId = cols.some(c => c.name === 'page_id');
      if(!hasPageId){
        db.run('ALTER TABLE comments ADD COLUMN page_id TEXT');
      }
    }
  });
  // ensure login_events exists if schema file not updated
  db.all("PRAGMA table_info(login_events)", (err, cols) => {
    if(err){
      // table missing -> create
      db.run(`CREATE TABLE IF NOT EXISTS login_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        success INTEGER NOT NULL,
        ip TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      );`);
      db.run('CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events(user_id);');
      db.run('CREATE INDEX IF NOT EXISTS idx_login_events_created ON login_events(created_at);');
    }
  });
  // ensure email_verified column
  db.all("PRAGMA table_info(users)", (err, cols) => {
    if(!err){
      const hasEV = cols.some(c=> c.name === 'email_verified');
      if(!hasEV){
        db.run('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
      }
    }
  });
  // ensure email_verifications table
  db.all("PRAGMA table_info(email_verifications)", (err, cols) => {
    if(err){
      db.run(`CREATE TABLE IF NOT EXISTS email_verifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );`);
      db.run('CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token);');
      db.run('CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id);');
    }
  });
}

function parseShopsFromHome() {
  if (!fs.existsSync(HOME_HTML)) return [];
  const html = fs.readFileSync(HOME_HTML, 'utf8');
  const $ = cheerio.load(html);
  const shops = [];
  $('.store-card').each((i, el) => {
    const name = $('h3', el).first().text().trim();
    const description = $('.meta', el).first().text().trim();
    const address = $('.address', el).first().text().trim();
    const ratingText = $('.rating', el).first().text().trim();
    const ratingMatch = ratingText.match(/([0-9]+(\.[0-9]+)?)/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
    let image_url = $('img', el).attr('src') || null;
    if (image_url && image_url.startsWith('data:')) image_url = null; // ignore data URIs for simplicity
    if (name) shops.push({ name, description, address, rating, image_url });
  });
  return shops;
}

function upsertShops(db, shops) {
  return new Promise((resolve, reject) => {
    const insert = db.prepare('INSERT OR IGNORE INTO shops (name, description, address, rating, image_url) VALUES (?,?,?,?,?)');
    shops.forEach(s => {
      insert.run(s.name, s.description, s.address, s.rating, s.image_url);
    });
    insert.finalize(err => err ? reject(err) : resolve());
  });
}

async function initAndSeed() {
  const db = getDb();
  await new Promise((resolve, reject) => db.serialize(() => { runSchema(db); resolve(); }));
  const shops = parseShopsFromHome();
  if (shops.length) {
    await upsertShops(db, shops);
  }
  db.close();
}

module.exports = { getDb, initAndSeed };
