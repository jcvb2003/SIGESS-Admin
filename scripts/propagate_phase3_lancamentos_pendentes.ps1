$PSQL = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$SQL  = "D:\Projetos Dev\REPOSITORIOS\SIGESS\Web\supabase\migrations\20260620_phase3_lancamentos_pendentes.sql"

$TENANTS = @{
  "MARANHAO"           = "postgresql://postgres.qatqzvyiipizqjgwqaui:<PASSWORD>@aws-1-us-east-2.pooler.supabase.com:5432/postgres"
  "SINPESCA_PARCEIROS" = "postgresql://postgres.typimbftfeiqdzrwtake:<PASSWORD>@aws-0-us-west-2.pooler.supabase.com:5432/postgres"
  "CLIENTES_DO_PARA"   = "postgresql://postgres.jatnbqspfvhvlzaoekzz:<PASSWORD>@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
  "OEIRAS"             = "postgresql://postgres.tnrzxuznerneilxoojgv:<PASSWORD>@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
}

foreach ($name in $TENANTS.Keys) {
  Write-Host "`n=== $name ===" -ForegroundColor Cyan
  & $PSQL $TENANTS[$name] -f $SQL
  if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO em $name" -ForegroundColor Red
    exit 1
  }
  Write-Host "OK: $name" -ForegroundColor Green
}

Write-Host "`n=== Propagação concluída ===" -ForegroundColor Green
