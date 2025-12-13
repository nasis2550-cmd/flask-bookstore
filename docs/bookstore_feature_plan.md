# Bookstore Management Upgrade Plan

## Goals
- Dedicated Add/Edit flows for bookstores with routing from the landing page.
- Reliable image upload pipeline that produces multiple responsive sizes and stores relative paths so files render after deploy.
- Location-aware browsing: detect the current user position (with permission handling), calculate distances to stores, and expose API sorting.
- Sorting controls for newest, distance, and rating.
- Error surfacing for missing images, failed uploads, or denied geolocation.
- Compatible with existing `/api/shops` consumers while introducing richer `/api/bookstores` endpoints.

## Data model updates (`shops` table)
| Column | Type | Notes |
| --- | --- | --- |
| `description` | TEXT | already present, used for detail field |
| `address` | TEXT | already present |
| `phone` | TEXT | **new** for contact info |
| `latitude`, `longitude` | REAL | **new** for geolocation + distance sort |
| `hours` | TEXT | **new** for opening hours |
| `tags` | TEXT | **new** to persist categories/keywords |
| `image_url` | TEXT | reused, stores relative path (e.g. `images/uploads/xxx-lg.webp`) |
| `image_thumb_url` | TEXT | **new** thumbnail variant |
| `rating` | REAL | already present |
| `created_at` | DATETIME | already present |
| `updated_at` | DATETIME | **new** auto-maintained |

Migrations run on startup (in `website_db.js`) to add the new columns if the SQLite file already exists.

## Backend endpoints
- `GET /api/bookstores` *(alias `/api/shops`)*: accepts `sort=distance|latest|rating`, optional `lat` & `lng`, and `limit`. Returns enriched rows plus `distance_km` when applicable.
- `GET /api/bookstores/:id` *(alias `/api/shops/:id`)*: returns one record + computed `imageVariants` to pre-fill edit form.
- `POST /api/bookstores` *(alias `/api/shops`)*: accepts JSON payload with the form fields. Auto-provisions a session user if none is present. Validates fields and persists coordinates.
- `PUT /api/bookstores/:id` *(alias `/api/shops/:id`)*: updates fields. Requires either a logged-in admin or an `x-manager-key` header that matches `process.env.MANAGER_KEY` (defaults to `dev-manager` for local testing).
- `POST /api/bookstores/upload`: handles `multipart/form-data` image uploads via Multer, saves to `images/uploads`, generates large/medium/thumb variants with Sharp, returns their URLs + intrinsic sizes. Ensures static serving works so images actually display.
- `GET /api/bookstores/nearby`: convenience wrapper around the list endpoint that enforces a radius and returns the closest stores.

Common validation:
- Required: `name`, `address`, `description`, `latitude`, `longitude`.
- Coordinates must be numeric and inside valid ranges. Phone/URL sanitized. Image paths stored as POSIX-style relative URLs so they match `express.static('.')`.

## Frontend routing & UX
- `home.html`: add a CTA button "เพิ่มร้านหนังสือ" linking to `add_bookstore.html`, include sorting dropdown, show geolocation status (permission / granted / denied), and surface image errors inline.
- `add_bookstore.html`: standalone form page that uses a shared script (`bookstore_form.js`) to collect inputs, fetch user location for quick fill, upload photo, preview variants, and submit to `POST /api/bookstores`.
- `edit_bookstore.html`: lists existing stores, allows selecting one to edit, fetches its data, displays the current image, and submits updates via `PUT /api/bookstores/:id`. Includes a manager-key input that is kept in `sessionStorage`.
- Shared JS: fetches `/api/bookstores` for live preview, handles geolocation permission states, and shows validation or upload errors next to the fields.

## Image upload strategy
1. Users pick an image file (JPG/PNG/WebP, max 5 MB).
2. Client uploads it to `/api/bookstores/upload`.
3. Server stores the source plus three Sharp-generated variants (`-lg.webp`, `-md.webp`, `-sm.webp`).
4. Response includes URLs for the variants; the form binds the medium version as the main `image_url` and the small version as `image_thumb_url`.
5. `main.js` tries `image_url`, falls back to thumbnail, and finally to existing heuristics. Errors are logged to `/admin_logs.html` and surfaced as warnings on the card.

## Sorting & geolocation UX contract
- `window.userLocation` is set once geolocation succeeds. Permission denials or timeouts update `#geoStatus` with actionable text.
- Sorting dropdown dispatches `fetchBookstores({ sort, lat, lng })`; if distance sort is chosen while location is unavailable, the UI prompts users to enable geolocation.
- When distance data exists, cards show `📍 ~X.X กม.`. Latest sort relies on `created_at`, rating sort on numeric rating.

## Error handling checklist
- Upload failures: show `toastError` on the form and keep the previous preview.
- Missing image: `main.js` now collects the candidate list, tries uploaded variants, and appends a warning badge if all fail.
- Geolocation denied: show explanation with a "ลองใหม่" button that calls `navigator.permissions.query` when supported.
- API validation errors bubble up with field-level hints.

This plan keeps the stack at **Node.js + Express + SQLite**, reuses the existing session model, and layers in the requested bookstore management capabilities.
