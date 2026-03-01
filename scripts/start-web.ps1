$root = Split-Path -Parent $PSScriptRoot
$webPath = Join-Path $root "apps\web"
Set-Location $webPath
npm run dev
