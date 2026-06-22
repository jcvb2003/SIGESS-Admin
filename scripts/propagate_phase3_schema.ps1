$PSQL = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$DIR  = "D:\Projetos Dev\REPOSITORIOS\SIGESS\Web\supabase\migrations"

$MIGRATIONS = @(
  "$DIR\20260619_phase3_cobrancas_externas.sql",
  "$DIR\20260619_phase3_configuracao_recebimento.sql"
)

# Preencher senhas antes de rodar (ver propagate_tenant_mode.ps1 para o padrao)
$TENANTS = @{
  "MARANHAO"           = "postgresql://postgres.qatqzvyiipizqjgwqaui:Sinpesca123%40@aws-1-us-east-2.pooler.supabase.com:5432/postgres"
  "SINPESCA_PARCEIROS" = "postgresql://postgres.typimbftfeiqdzrwtake:Sinpesca123%40@aws-0-us-west-2.pooler.supabase.com:5432/postgres"
  "CLIENTES_DO_PARA"   = "postgresql://postgres.jatnbqspfvhvlzaoekzz:Sinpesca123%40@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
  "OEIRAS"             = "postgresql://postgres.tnrzxuznerneilxoojgv:Sinpesca123%40@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
}

foreach ($name in $TENANTS.Keys) {
  Write-Host "`n=== $name ===" -ForegroundColor Cyan
  foreach ($sql in $MIGRATIONS) {
    Write-Host "  -> $(Split-Path $sql -Leaf)" -ForegroundColor Gray
    & $PSQL $TENANTS[$name] -f $sql
    if ($LASTEXITCODE -ne 0) {
      Write-Host "ERRO em $name / $(Split-Path $sql -Leaf)" -ForegroundColor Red
      exit 1
    }
  }
  Write-Host "OK: $name" -ForegroundColor Green
}

Write-Host "`n=== Phase 3 schema propagado com sucesso ===" -ForegroundColor Green
