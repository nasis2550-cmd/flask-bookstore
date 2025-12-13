import os
import sys
import webbrowser
import subprocess
import time

BASE = os.path.dirname(os.path.abspath(__file__))

# Prefer venv python if available, else fallback to current interpreter
VENV_PY = os.path.abspath(os.path.join(BASE, '..', '..', '.venv', 'Scripts', 'python.exe'))
PY = VENV_PY if os.path.exists(VENV_PY) else (sys.executable or 'python')

env = os.environ.copy()

print('Starting Flask server (port 8080) using:', PY)
proc = subprocess.Popen([PY, os.path.join(BASE, 'app.py')], cwd=BASE, env=env)

# Wait a bit for server to boot
time.sleep(2.5)
url = 'http://localhost:8080/admin.html'
print('Opening', url)
try:
    webbrowser.open(url)
except Exception:
    pass

print('Server running. Press Ctrl+C to stop.')
try:
    proc.wait()
except KeyboardInterrupt:
    proc.terminate()
    try:
        proc.wait(timeout=3)
    except Exception:
        pass
