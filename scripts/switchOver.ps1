# One-off: moves the LIVE database over to multi-business.
# Uses the live DATABASE_URL from the commented-out line in .env.local (host ep-round-mode-a7hgee5t) for this run only;
# .env.local itself is not changed, so the local app keeps using the dev database.
#
#   Part 1 - additive, safe while the old single-business site is live:
#            businesses + business_id (stage 1), TGP owners, subscription columns (stage 4).
#   Part 2 - the live site's API stops working from here until the multi-business code is deployed:
#            row-level security (stage 2), peptide library + supplier price list (stage 3) and TGP's copy of them.
#
# Usage (from the project folder):
#   powershell -ExecutionPolicy Bypass -File scripts\switchOver.ps1 -Part 1
#   powershell -ExecutionPolicy Bypass -File scripts\switchOver.ps1 -Part 2
param([Parameter(Mandatory = $true)][ValidateSet("1", "2")][string]$Part)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot)

# The Gene Protocol's owner on the PRODUCTION Clerk instance (.env.local's ADMIN_USER_IDS is the test instance's).
$LiveOwners = "user_3JiEbnmIBeFfv2eugiBSTvE0YmY"
$LiveHost = "ep-round-mode-a7hgee5t"

$line = Get-Content .env.local | Where-Object { $_ -match "^\s*#\s*DATABASE_URL=\S*$LiveHost" } | Select-Object -First 1
if (-not $line) { throw "No commented-out live DATABASE_URL ($LiveHost) found in .env.local - stopping." }

function Step([string]$label, [string]$exe, [string[]]$arguments) {
    Write-Host "`n== $label" -ForegroundColor Cyan
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) { throw "'$label' failed - stopping. Nothing after it has run." }
}

# dotenv never overrides variables already set, so these win over .env.local for the scripts below.
$env:DATABASE_URL = ($line -replace "^\s*#\s*DATABASE_URL=", "").Trim()
$env:ADMIN_USER_IDS = $LiveOwners
try {
    Write-Host "LIVE database ($LiveHost) - part $Part" -ForegroundColor Yellow
    if ($Part -eq "1") {
        Step "Stage 1: businesses, owners table, business_id on every table" node @("scripts/applySql.mjs", "scripts/multi-business.sql")
        Step "The Gene Protocol's owner" node @("scripts/seedBusinessOwners.mjs")
        Step "Stage 4: subscription columns" node @("scripts/applySql.mjs", "scripts/multi-business-4.sql")
        Write-Host "`nPart 1 done. The live site is unaffected." -ForegroundColor Green
    } else {
        Step "Stage 2: each request only sees its own business" node @("scripts/applySql.mjs", "scripts/multi-business-2.sql")
        Step "Stage 3: peptide library and supplier price list tables" node @("scripts/applySql.mjs", "scripts/multi-business-3.sql")
        Step "The Gene Protocol's peptide library and price list" npx @("tsx", "scripts/seedPeptideLibrary.ts")
        Write-Host "`nPart 2 done. Deploy the multi-business code now - the live API is down until you do." -ForegroundColor Green
    }
} finally {
    Remove-Item Env:DATABASE_URL, Env:ADMIN_USER_IDS -ErrorAction SilentlyContinue
}
