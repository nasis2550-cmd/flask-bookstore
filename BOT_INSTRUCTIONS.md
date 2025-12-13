# Bot Instructions (English Version)

This document defines how the application should behave using a single SQLite database `website.db` for shop data, user accounts, and comments.

## 1. Database: `website.db`
Use `website.db` as the main SQLite database.

Required tables (created by `schema_website.sql`):
- `shops`: stores all shop entries parsed from `home.html`.
- `users`: stores login credentials (username, email, password hash).
- `comments`: stores user comments linked to shops and users.

### Table Overview
`shops(id, name UNIQUE, description, address, rating, image_url, created_at)`
`users(id, username UNIQUE, email UNIQUE, password_hash, created_at)`
`comments(id, shop_id FK->shops.id, user_id FK->users.id, content, created_at)`

## 2. Home Page Data Handling (`home.html`)
On server startup (`server_sqlite.js`):
1. Read `home.html`.
2. Parse all `.store-card` entries.
3. Extract: name, description (meta text), address, rating, first image `src` if any.
4. Insert each as a row in `shops` using `INSERT OR IGNORE` to prevent duplicates (unique by name).

## 3. Login System
Endpoints (SQLite server):
- `POST /api/sqlite/register`: fields `{ username, email, password }`. Hash password using bcrypt (12 rounds). Store `password_hash`.
- `POST /api/sqlite/login`: verify user by username + password. On success store `req.session.user = { id, username }`.
- `POST /api/sqlite/logout`: destroy session.

Authentication method: session-based via `express-session` (HTTP-only cookie).

## 4. Comment System
Logged-in users can create comments bound to a shop:
- `POST /api/sqlite/shops/:id/comments` body `{ content }` -> creates comment.
- `PUT /api/sqlite/comments/:id` body `{ content }` -> edit own comment.
- `DELETE /api/sqlite/comments/:id` -> delete own comment.
- `GET /api/sqlite/shops/:id` -> returns `{ shop, comments[] }`.
- `GET /api/sqlite/shops` -> list all shops.

Each comment row includes: `shop_id`, `user_id`, `content`, `created_at`.

## 5. Bot Behavior Rules
On startup:
- Initialize schema (create tables if missing).
- Parse and upsert shops from `home.html`.

On user login:
- Check credentials via `users` table.
- Store user info in session.

On comment submission:
- Verify session (user authenticated).
- Check shop exists.
- Insert into `comments`.

On shop page/API load:
- Fetch shop data from `shops`.
- Fetch associated comments joined with `users` for usernames.

## 6. Running the SQLite Server
1. Ensure dependencies installed: `npm install` (requires `sqlite3`, `cheerio`, `express`, `bcrypt`).
2. Copy `.env.example` to `.env` and set `SESSION_SECRET` (and optional `SQLITE_PORT`).
3. Start server: `npm run start:sqlite` (default port 3001).
4. Access endpoints: `http://localhost:3001/api/sqlite/...`
5. Static pages (including `home.html` and `sqlite_viewer.html`) also served from port 3001.

## 7. Notes / Extensions
- For token-based auth, replace sessions with JWT; store tokens client-side and send via `Authorization` header.
- To avoid reparsing `home.html` on every restart, you could mark a version or last parse timestamp.
- Add search endpoints later: `GET /api/sqlite/shops/search?q=...`.
- Add pagination to comments if they grow large.

## 8. Security Considerations
- Always hash passwords using a strong cost factor (current: 12 rounds).
- Session cookies are HTTP-only; for production add `secure: true` behind HTTPS and a stronger `SESSION_SECRET`.
- Input validation ensures non-empty comment content; extend with length limits as needed.

## 9. Data Consistency
- `INSERT OR IGNORE` prevents duplicate shops (by name). To update changed metadata you could use `INSERT INTO ... ON CONFLICT(name) DO UPDATE SET ...` (requires replacing current statement with an UPSERT for modifications).

## 10. File Responsibilities
- `schema_website.sql`: schema definitions.
- `website_db.js`: initializes DB and seeds shops.
- `server_sqlite.js`: Express API + session auth + comments + shops.
- `home.html`: source for initial shop dataset.

This fulfills all specified Bot Instructions with a clean separation between MySQL (legacy) and new unified SQLite path.
