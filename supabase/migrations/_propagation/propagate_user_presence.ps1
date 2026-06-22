$SQL = Join-Path $PSScriptRoot "20260618_user_presence_combined.sql"
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

Run-Migration "Z2 (jatnbqspfvhvlzaoekzz)"       "postgresql://postgres.jatnbqspfvhvlzaoekzz:Sinpesca123%40@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
Run-Migration "BREVES (typimbftfeiqdzrwtake)"    "postgresql://postgres.typimbftfeiqdzrwtake:Sinpesca123%40@aws-0-us-west-2.pooler.supabase.com:5432/postgres"
Run-Migration "OEIRAS (tnrzxuznerneilxoojgv)"   "postgresql://postgres.tnrzxuznerneilxoojgv:Sinpesca123%40@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
Run-Migration "MARANHAO (qatqzvyiipizqjgwqaui)" "postgresql://postgres.qatqzvyiipizqjgwqaui:Sinpesca123%40@aws-1-us-east-2.pooler.supabase.com:5432/postgres"

Write-Host "`nDone." -ForegroundColor Green
