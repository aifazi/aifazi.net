# Guard: refuse `docker compose up` against production Supabase by accident.
# Usage: powershell -File scripts/check_compose_env.ps1
# Checks .env.local for SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL pointing at prod.
# Exit 1 = likely prod → abort. Set COMPOSE_ALLOW_PROD=1 to override explicitly.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env.local'
if (-not (Test-Path $envFile)) { $envFile = Join-Path $root 'aifazi.net-frontend-next\.env.local' }
if (-not (Test-Path $envFile)) { Write-Host 'No .env.local found — nothing to guard.'; exit 0 }

$lines = Get-Content $envFile -ErrorAction Stop
$urls = $lines | Where-Object { $_ -match '^\s*(NEXT_PUBLIC_)?SUPABASE_URL\s*=' }
foreach ($u in $urls) {
  $key = ($u -split '=', 2)[0].Trim()
  Write-Host "  $key = <hidden>"
}
$prodHints = @('supabase.aifazi.net', 'api.aifazi.net')
$hit = $false
foreach ($line in $lines) {
  foreach ($h in $prodHints) { if ($line -match [regex]::Escape($h)) { $hit = $true } }
}
if ($hit -and $env:COMPOSE_ALLOW_PROD -ne '1') {
  Write-Host ''
  Write-Host 'BLOCKED: .env.local looks like PRODUCTION Supabase.' -ForegroundColor Red
  Write-Host 'Point compose at a staging project (see docker-compose.yml:7-14), or run with COMPOSE_ALLOW_PROD=1 if you really mean it.'
  exit 1
}
Write-Host 'Compose env guard passed (no prod Supabase detected).'
