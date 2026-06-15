$SQL  = Join-Path $PSScriptRoot "20260614_hardening_combined.sql"
$PSQL = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

function Run-Migration($label, $dbUrl) {
  Write-Host "`n>>> $label" -ForegroundColor Cyan
  & $PSQL $dbUrl -f $SQL -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO em $label" -ForegroundColor Red
    exit 1
  }
  Write-Host "OK: $label" -ForegroundColor Green
}

# Rodada 1: apenas BREVES (alvo da migracao ELAINE->BREVES)
# MARANHAO entra somente apos validacao e decisao de baseline universal
Run-Migration "BREVES (typimbftfeiqdzrwtake)" "postgresql://postgres.typimbftfeiqdzrwtake:Sinpesca123%40@aws-0-us-west-2.pooler.supabase.com:5432/postgres"

Write-Host "`nDone." -ForegroundColor Green
