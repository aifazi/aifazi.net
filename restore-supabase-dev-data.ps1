param(
  [string]$DumpPath = "C:\tmp\aifazi-public-data.sql",
  [string]$ProjectRef = "xdzhvwmttshrauemakea",
  [string]$HostName = "aws-1-ap-southeast-1.pooler.supabase.com"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $DumpPath)) {
  throw "Dump file not found: $DumpPath"
}

$dbPassword = Read-Host "Target Supabase database password"
$env:PGPASSWORD = $dbPassword

try {
  docker run --rm -i `
    -e PGHOST=$HostName `
    -e PGPORT=5432 `
    -e PGDATABASE=postgres `
    -e PGUSER=postgres.$ProjectRef `
    -e PGPASSWORD `
    -e PGSSLMODE=require `
    -v "C:\tmp:/dump" `
    postgres:17 `
    psql `
    -v ON_ERROR_STOP=1 `
    -f "/dump/$(Split-Path -Leaf $DumpPath)"
}
finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
