# Quick Start — Run The App

## Flask (recommended)
```powershell
Set-Location "c:\Users\User\OneDrive\Documents\project"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python .\app.py
```
Open `http://localhost:5000/login_red.html`. Health: `http://localhost:5000/api/health`.

Or auto-open:
```powershell
python .\start_server.py
```

## Node + SQLite (optional)
```powershell
Set-Location "c:\Users\User\OneDrive\Documents\project"
npm install
node .\server_sqlite.js
```
Open `http://localhost:3001/login_red.html`.

## Tips
- Do not open `file:///.../login_red.html`; use `http://localhost:PORT/...`.
- Run one backend at a time and match ports.
