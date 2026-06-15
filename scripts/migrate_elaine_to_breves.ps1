$PGDUMP = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
$PSQL   = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$ELAINE = "postgresql://postgres.ofctchwvvvjpnwznsrpg:Sinpesca123%40@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
$BREVES = "postgresql://postgres.typimbftfeiqdzrwtake:Sinpesca123%40@aws-0-us-west-2.pooler.supabase.com:5432/postgres"
$OUT    = "D:\Projetos Dev\REPOSITORIOS\SIGESS\backup\elaine_migration"
New-Item -ItemType Directory -Force -Path $OUT | Out-Null

$OLD_TENANT = "de56c498-5346-4085-bd32-fc97c25eb918"
$OLD_UNIT   = "64c176a7-b368-4c52-89e5-b063e65a3d10"
$NEW_TENANT = "d4ab1d9a-df06-496e-b95e-69330b65cb62"
$NEW_UNIT   = "1506de4a-5e25-4451-83a1-186b37ad298e"

$TABLES = @(
  "entidade",
  "configuracao_entidade",
  "parametros",
  "parametros_financeiros",
  "localidades",
  "templates",
  "socios"
)

Write-Host "`n=== FASE 7: Exportacao de ELAINE ===" -ForegroundColor Cyan

foreach ($TABLE in $TABLES) {
  Write-Host "Exportando $TABLE..."
  & $PGDUMP $ELAINE --data-only --inserts --table=public.$TABLE -f "$OUT\$TABLE.sql"
  if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO ao exportar $TABLE" -ForegroundColor Red
    exit 1
  }

  (Get-Content "$OUT\$TABLE.sql" -Encoding UTF8) `
    -replace $OLD_TENANT, $NEW_TENANT `
    -replace $OLD_UNIT,   $NEW_UNIT |
  Set-Content "$OUT\${TABLE}_breves.sql" -Encoding UTF8
}

Write-Host "`nVerificando vazamento de UUIDs antigos..."
$leaks = 0
foreach ($TABLE in $TABLES) {
  $n = (Select-String -Path "$OUT\${TABLE}_breves.sql" -Pattern $OLD_TENANT -Quiet:$false).Count
  if ($n -gt 0) {
    Write-Host "AVISO: $n ocorrencias de OLD_TENANT em ${TABLE}_breves.sql" -ForegroundColor Red
    $leaks++
  }
  $n2 = (Select-String -Path "$OUT\${TABLE}_breves.sql" -Pattern $OLD_UNIT -Quiet:$false).Count
  if ($n2 -gt 0) {
    Write-Host "AVISO: $n2 ocorrencias de OLD_UNIT em ${TABLE}_breves.sql" -ForegroundColor Red
    $leaks++
  }
}
if ($leaks -gt 0) {
  Write-Host "`nVazamentos detectados. Corrigir antes de importar." -ForegroundColor Red
  exit 1
}

Write-Host "`nMontando arquivo consolidado de importacao..."
$IMPORT_FILE = "$OUT\import_all_breves.sql"
$Order = @("entidade","configuracao_entidade","parametros","parametros_financeiros","localidades","templates","socios")

[System.Text.UTF8Encoding]::new($false).GetBytes("BEGIN;`n") | Set-Content $IMPORT_FILE -Encoding Byte
foreach ($TABLE in $Order) {
  $header = "`n-- $TABLE`n"
  [System.Text.UTF8Encoding]::new($false).GetBytes($header) | Add-Content $IMPORT_FILE -Encoding Byte
  $content = Get-Content "$OUT\${TABLE}_breves.sql" -Raw -Encoding UTF8
  [System.Text.UTF8Encoding]::new($false).GetBytes($content) | Add-Content $IMPORT_FILE -Encoding Byte
}
[System.Text.UTF8Encoding]::new($false).GetBytes("`nCOMMIT;`n") | Add-Content $IMPORT_FILE -Encoding Byte

Write-Host "Arquivo consolidado: $IMPORT_FILE"
Write-Host "`nRevisar o arquivo antes de executar a importacao."
Write-Host "Quando pronto, executar:"
Write-Host "  & `"$PSQL`" `"$BREVES`" -f `"$IMPORT_FILE`" -v ON_ERROR_STOP=1" -ForegroundColor Yellow
