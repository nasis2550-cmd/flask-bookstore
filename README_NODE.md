# Node.js Auth + Comments (MySQL) + Bookstores (SQLite)

This project now supports:

- Login + comments stored in MySQL
- Bookstore list (extracted from `home.html`) stored in a local SQLite file `HD.db`

## Features
- Users table with hashed passwords (bcrypt)
- Auth routes: `POST /api/register`, `POST /api/login`, `POST /api/logout`
- Comment routes: `POST /api/comments`, `PUT /api/comments/:id`, `DELETE /api/comments/:id`, `GET /api/comments`
- MySQL prepared statements via `mysql2`
- Session-based auth using `express-session`
- SQLite build script: `npm run build:sqlite` parses `home.html` and populates `bookstores` table
- SQLite viewer page: `sqlite_viewer.html` (client-side, no server processing)

## Setup (MySQL part)

1. Install Node.js 18+
2. Create the database and tables:
   - Edit `.env` from `.env.example`
   - Import `schema.sql` into your MySQL server.
3. Install dependencies:

```powershell
# From the project folder
npm install
```

4. Start the server:

```powershell
# Development (auto-restart)


# Or production
npm start
```

Server runs at: `http://localhost:3000`

## Build / Update HD.db (SQLite)

`HD.db` stores bookstore records extracted from `home.html` plus empty `users` & `comments` tables.

```powershell
# Ensure dependencies installed
npm install

# Build or refresh HD.db
npm run build:sqlite
```

After running you'll see `HD.db` in the project root. View it with:

```
http://localhost:3000/sqlite_viewer.html
```

Or using CLI (if you have sqlite3 installed):

```powershell
sqlite3 HD.db "SELECT COUNT(*) FROM bookstores;"
sqlite3 HD.db "SELECT id, name, rating FROM bookstores LIMIT 5;"
```

Re-run `npm run build:sqlite` whenever you edit the `<article class="store-card">` blocks in `home.html`.

### Bookstores table columns
| Column | Description |
| ------ | ----------- |
| id | PRIMARY KEY |
| name | Store name |
| meta | Location + size text |
| address | Address text |
| phone | Phone number (emoji removed) |
| hours | Opening hours |
| tags | Categories / genres |
| rating | Numeric star rating |
| created_at | Timestamp |

## API Usage Examples (MySQL auth/comments)

- Register:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/register -Body @{username='alice';email='alice@example.com';password='secret'}
```

- Login:

```powershell
# Use -SessionVariable to retain cookies for subsequent requests
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/login -Body @{username='alice';password='secret'} -SessionVariable s
```

- Create comment:

```powershell
Invoke-RestMethod -Method Post -WebSession $s -Uri http://localhost:3000/api/comments -Body @{content='Hello world'}
```

- Edit comment:

```powershell
Invoke-RestMethod -Method Put -WebSession $s -Uri http://localhost:3000/api/comments/1 -Body @{content='Edited text'}
```

- Delete comment:

```powershell
Invoke-RestMethod -Method Delete -WebSession $s -Uri http://localhost:3000/api/comments/1
```

- List comments:

```powershell
Invoke-RestMethod -Method Get -Uri http://localhost:3000/api/comments
```

## Notes
- Ensure `SESSION_SECRET` in `.env` is a long random string.
- Static files (HTML) are served from project root: e.g. `http://localhost:3000/home.html`.
- SQLite build is separate; server currently does not serve bookstore data from SQLite (can be added later if needed).
- Use `sqlite_viewer.html` for quick inspection without installing extra tools.
