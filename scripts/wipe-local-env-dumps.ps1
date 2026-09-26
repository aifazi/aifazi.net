# Wipe local env dumps (run AFTER secret rotation)
# Usage: powershell -File scripts/wipe-local-env-dumps.ps1 [-Force]
# Deletes untracked local .env pulls that may hold production secrets.

param([switch]$Force)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$targets = @(
    (Join-Path $root 'aifazi.net-backend-fastapi\.env.prod-pull'),
    (Join-Path $root 'aifazi.net-backend-fastapi\.env.pulled'),
    (Join-Path $root 'aifazi.net-backend-fastapi\.env.pull'),
    (Join-Path $root 'aifazi.net-frontend-next\.env.local'),
    (Join-Path $root 'apps\mobile\.env.local')
)

$found = $targets | Where-Object { Test-Path $_ }
if (-not $found) {
    Write-Host 'Nothing to delete — no local env dumps found.'
    exit 0
}

Write-Host 'Will delete:'
$found | ForEach-Object { Write-Host "  $_" }

if (-not $Force) {
    $ans = Read-Host 'Type DELETE to confirm (secrets in these files should already be rotated)'
    if ($ans -ne 'DELETE') {
        Write-Host 'Aborted.'
        exit 1
    }
}

foreach ($f in $found) {
    # Overwrite with zeros before delete (best-effort; SSD wear-leveling may leave copies)
    try {
        $len = (Get-Item $f).Length
        if ($len -gt 0) {
            $fs = [System.IO.File]::Open($f, 'Open', 'Write')
            $zero = New-Object byte[] $len
            $fs.Write($zero, 0, $len)
            $fs.Close()
        }
    } catch { Write-Warning "Could not zero $f : $_" }
    Remove-Item $f -Force
    Write-Host "Deleted $f"
}

Write-Host 'Done. Confirm none of these secrets remain in Vercel/Coolify/EAS.'
