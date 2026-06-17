$SQL_HARDENING = Join-Path $PSScriptRoot "20260614_hardening_combined.sql"
$SQL_OWNER_FIX = Join-Path (Split-Path $PSScriptRoot -Parent) "20260616_fix_owner_auto_membership_single_unit.sql"
$PSQL = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

function Run-Migration($label, $dbUrl, $sqlPath) {
  Write-Host "`n>>> $label" -ForegroundColor Cyan
  & $PSQL $dbUrl -f $sqlPath -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO em $label" -ForegroundColor Red
    exit 1
  }
  Write-Host "OK: $label" -ForegroundColor Green
}

# Canonico atual: typimbftfeiqdzrwtake = SINPESCA PARCEIROS
# Ordem deliberada:
# 1. Hardening de RPCs shared
# 2. Hotfix owner sem membership em single-unit
$PARCEIROS_DB_URL = "postgresql://postgres.typimbftfeiqdzrwtake:Sinpesca123%40@aws-0-us-west-2.pooler.supabase.com:5432/postgres"

Run-Migration "SINPESCA PARCEIROS - hardening shared RPCs (typimbftfeiqdzrwtake)" $PARCEIROS_DB_URL $SQL_HARDENING
Run-Migration "SINPESCA PARCEIROS - fix owner auto-membership (typimbftfeiqdzrwtake)" $PARCEIROS_DB_URL $SQL_OWNER_FIX

Write-Host "`nDone." -ForegroundColor Green
