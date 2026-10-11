# Runs one TypeScript script against the LIVE database.
# Uses the live DATABASE_URL from the commented-out line in .env.local (host ep-round-mode-a7hgee5t) for this run only;
# .env.local itself is not changed, so the local app keeps using the dev database.
#
# Usage (from the project folder; use forward slashes in Git Bash):
#   powershell -ExecutionPolicy Bypass -File scripts/runLive.ps1 scripts/updateShopPrices.ts [--apply]
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Script,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot)

$LiveHost = "ep-round-mode-a7hgee5t"
if (-not (Test-Path $Script)) { throw "Can't find $Script - stopping." }

$line = Get-Content .env.local | Where-Object { $_ -match "^\s*#\s*DATABASE_URL=\S*$LiveHost" } | Select-Object -First 1
if (-not $line) { throw "No commented-out live DATABASE_URL ($LiveHost) found in .env.local - stopping." }

# dotenv never overrides variables already set, so this wins over .env.local for the script.
$env:DATABASE_URL = ($line -replace "^\s*#\s*DATABASE_URL=", "").Trim()
try {
    Write-Host "LIVE database ($LiveHost): $Script $Rest" -ForegroundColor Yellow
    npx tsx $Script @Rest
    if ($LASTEXITCODE -ne 0) { throw "$Script failed." }
} finally {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}
