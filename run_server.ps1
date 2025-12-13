param(
  [int]$Port = 8080
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $root '.venv\Scripts\python.exe'
if (!(Test-Path $python)) {
  Write-Host "Python venv not found at $python" -ForegroundColor Red
  exit 1
}
Set-Location $root
Write-Host "Starting Flask (app.py) on http://localhost:$Port ..." -ForegroundColor Cyan
# app.py runs on port 8080 when executed directly; ensure correct path
& $python ".\project\project\project\app.py"
