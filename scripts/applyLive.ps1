# Applies one .sql file to the LIVE database.
# Uses the live DATABASE_URL from the commented-out line in .env.local (host ep-round-mode-a7hgee5t) for this run only;
# .env.local itself is not changed, so the local app keeps using the dev database.
#
# Usage (from the project folder):
#   powershell -ExecutionPolicy Bypass -File scripts\applyLive.ps1 scripts\order-alerts.sql
param([Parameter(Mandatory = $true)][string]$SqlFile)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot)

$LiveHost = "ep-round-mode-a7hgee5t"
if (-not (Test-Path $SqlFile)) { throw "Can't find $SqlFile - stopping." }

$line = Get-Content .env.local | Where-Object { $_ -match "^\s*#\s*DATABASE_URL=\S*$LiveHost" } | Select-Object -First 1
if (-not $line) { throw "No commented-out live DATABASE_URL ($LiveHost) found in .env.local - stopping." }

# dotenv never overrides variables already set, so this wins over .env.local for applySql.mjs.
$env:DATABASE_URL = ($line -replace "^\s*#\s*DATABASE_URL=", "").Trim()
try {
    Write-Host "LIVE database ($LiveHost): $SqlFile" -ForegroundColor Yellow
    node scripts/applySql.mjs $SqlFile
    if ($LASTEXITCODE -ne 0) { throw "$SqlFile failed - nothing was changed after the error." }
    Write-Host "`nDone." -ForegroundColor Green
} finally {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}
