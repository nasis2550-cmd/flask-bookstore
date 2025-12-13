// build_sqlite.js - generate HD.db (SQLite) from home.html bookstore cards
// Usage: npm run build:sqlite

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const sqlite3 = require('sqlite3').verbose();

const DB_FILE = path.join(__dirname, 'HD.db');
const HTML_FILE = path.join(__dirname, 'home.html');
const SCHEMA_FILE = path.join(__dirname, 'schema_sqlite.sql');

function ensureSchema(db){
  const schema = fs.readFileSync(SCHEMA_FILE, 'utf8');
  // Split on semicolons to execute statements individually (simple approach)
  schema.split(/;\s*\n/).map(s => s.trim()).filter(Boolean).forEach(stmt => {
    db.run(stmt + ';');
  });
}

function parseBookstores(){
  if(!fs.existsSync(HTML_FILE)) throw new Error('home.html not found');
  const html = fs.readFileSync(HTML_FILE, 'utf8');
  const $ = cheerio.load(html);
  const items = [];
  $('.store-card').each((i, el) => {
    const name = $('h3', el).first().text().trim();
    const meta = $('.meta', el).first().text().trim();
    const address = $('.address', el).first().text().trim();
    const phoneRaw = $('.phone', el).first().text().trim();
    const phone = phoneRaw.replace(/^📞\s*/,'');
    const hoursRaw = $('.hours', el).first().text().trim();
    const hours = hoursRaw.replace(/^🕒\s*/,'');
    const tags = $('.tags', el).first().text().trim();
    const ratingRaw = $('.rating', el).first().text().trim();
    const ratingMatch = ratingRaw.match(/([0-9]+(\.[0-9]+)?)/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
    if(name) items.push({ name, meta, address, phone, hours, tags, rating });
  });
  return items;
}

function main(){
  console.log('Building SQLite database HD.db ...');
  const dbExists = fs.existsSync(DB_FILE);
  const db = new sqlite3.Database(DB_FILE);
  db.serialize(() => {
    ensureSchema(db);
    const bookstores = parseBookstores();
    console.log(`Parsed ${bookstores.length} bookstores from home.html`);
    db.run('DELETE FROM bookstores');
    const stmt = db.prepare('INSERT INTO bookstores (name, meta, address, phone, hours, tags, rating) VALUES (?,?,?,?,?,?,?)');
    bookstores.forEach(b => {
      stmt.run(b.name, b.meta, b.address, b.phone, b.hours, b.tags, b.rating);
    });
    stmt.finalize();
  });
  db.close(() => {
    console.log('HD.db updated successfully.');
    console.log('You can inspect it via sqlite_viewer.html or any SQLite client.');
  });
}

if (require.main === module) {
  try { main(); } catch (e) { console.error(e); process.exit(1); }
}
