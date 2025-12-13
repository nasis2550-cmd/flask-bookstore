@echo off
setlocal
set "ROOT=%~dp0"
set "VENV_PY=%ROOT%\.venv\Scripts\python.exe"
set "APP=%ROOT%project\project\project\app.py"
if exist "%VENV_PY%" (
  echo Starting with venv Python: "%VENV_PY%" "%APP%"
  "%VENV_PY%" "%APP%"
) else (
  echo Venv python not found. Trying py launcher...
  py -3.11 "%APP%"
)
