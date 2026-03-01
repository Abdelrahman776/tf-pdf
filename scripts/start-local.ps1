$root = Split-Path -Parent $PSScriptRoot

$apiPath = Join-Path $root "apps\api"
$webPath = Join-Path $root "apps\web"

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$apiPath'; .\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8010"
)

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$webPath'; npm run dev"
)

Write-Host "Started API (8010) and Web (Vite dev server)."
