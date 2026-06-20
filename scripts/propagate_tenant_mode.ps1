$PSQL = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$SQL  = "D:\Projetos Dev\REPOSITORIOS\SIGESS\Web\supabase\migrations\20260619_add_tenant_mode_to_entidade.sql"

# Preencher connection strings dos 4 tenants ativos
$TENANTS = @{
  "MARANHAO"         = "postgresql://postgres.qatqzvyiipizqjgwqaui:<PASSWORD>@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
  "SINPESCA"         = "postgresql://postgres.typimbftfeiqdzrwtake:<PASSWORD>@aws-0-us-west-2.pooler.supabase.com:5432/postgres"
  "CLIENTES_DO_PARA" = "postgresql://postgres.jatnbqspfvhvlzaoekzz:<PASSWORD>@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
  "OEIRAS"           = "postgresql://postgres.tnrzxuznerneilxoojgv:<PASSWORD>@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
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

Write-Host "`n=== Propagacao concluida ===" -ForegroundColor Green
