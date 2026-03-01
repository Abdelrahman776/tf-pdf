$root = Split-Path -Parent $PSScriptRoot
$apiPath = Join-Path $root "apps\api"
Set-Location $apiPath
.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8010
