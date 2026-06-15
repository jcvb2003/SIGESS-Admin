# migrate_fotos_elaine_to_breves.ps1
# Copia todos os objetos do bucket "fotos" de ELAINE para BREVES via Supabase Storage API.
#
# PRE-REQUISITOS:
#   $env:SUPABASE_PAT_ELAINE  = PAT com acesso ao projeto ofctchwvvvjpnwznsrpg
#   $env:SUPABASE_PAT_BREVES  = PAT com acesso ao projeto typimbftfeiqdzrwtake
#
# EXECUCAO:
#   $env:SUPABASE_PAT_ELAINE = "sbp_..."; $env:SUPABASE_PAT_BREVES = "sbp_..."
#   .\migrate_fotos_elaine_to_breves.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# --- Validar PATs ---
$PAT_ELAINE = $env:SUPABASE_PAT_ELAINE
$PAT_BREVES = $env:SUPABASE_PAT_BREVES

if (-not $PAT_ELAINE) { throw "Variavel de ambiente SUPABASE_PAT_ELAINE nao definida." }
if (-not $PAT_BREVES) { throw "Variavel de ambiente SUPABASE_PAT_BREVES nao definida." }

# --- Obter service role keys via Management API ---
Write-Host "Obtendo service role keys..." -ForegroundColor Cyan

$elaine_api_keys = Invoke-RestMethod `
    -Uri "https://api.supabase.com/v1/projects/ofctchwvvvjpnwznsrpg/api-keys" `
    -Headers @{ Authorization = "Bearer $PAT_ELAINE" }

$breves_api_keys = Invoke-RestMethod `
    -Uri "https://api.supabase.com/v1/projects/typimbftfeiqdzrwtake/api-keys" `
    -Headers @{ Authorization = "Bearer $PAT_BREVES" }

$ELAINE_KEY = ($elaine_api_keys | Where-Object { $_.name -eq "service_role" }).api_key
$BREVES_KEY = ($breves_api_keys | Where-Object { $_.name -eq "service_role" }).api_key

if (-not $ELAINE_KEY) { throw "Nao foi possivel obter service_role key do ELAINE." }
if (-not $BREVES_KEY) { throw "Nao foi possivel obter service_role key do BREVES." }

$ELAINE_URL = "https://ofctchwvvvjpnwznsrpg.supabase.co"
$BREVES_URL = "https://typimbftfeiqdzrwtake.supabase.co"

$ELAINE_HDR = @{ Authorization = "Bearer $ELAINE_KEY"; apikey = $ELAINE_KEY }
$BREVES_HDR = @{ Authorization = "Bearer $BREVES_KEY"; apikey = $BREVES_KEY }

# --- Funcao auxiliar: listar bucket com paginacao ---
function List-BucketAll($baseUrl, $headers, $bucket) {
    $all    = [System.Collections.Generic.List[object]]::new()
    $limit  = 1000
    $offset = 0
    do {
        $body = (@{ limit = $limit; offset = $offset; prefix = "" } | ConvertTo-Json)
        $page = Invoke-RestMethod -Method Post `
            -Uri "$baseUrl/storage/v1/object/list/$bucket" `
            -Headers ($headers + @{ "Content-Type" = "application/json" }) `
            -Body $body
        foreach ($item in $page) { $all.Add($item) }
        $offset += $limit
    } while ($page.Count -eq $limit)
    return $all
}

# --- Listar origem ---
Write-Host "Listando bucket 'fotos' em ELAINE..." -ForegroundColor Cyan
$sourceFiles = List-BucketAll $ELAINE_URL $ELAINE_HDR "fotos"
Write-Host "Total de arquivos na origem (ELAINE): $($sourceFiles.Count)"

if ($sourceFiles.Count -eq 0) {
    Write-Host "Bucket origem vazio. Nada a copiar." -ForegroundColor Yellow
    exit 0
}

# --- Copiar cada arquivo ---
$success  = 0
$failed   = 0
$failures = [System.Collections.Generic.List[string]]::new()
$tempDir  = [System.IO.Path]::GetTempPath()

Write-Host ""
foreach ($file in $sourceFiles) {
    $name    = $file.name
    $tempFile = [System.IO.Path]::Combine($tempDir, [System.IO.Path]::GetRandomFileName() + ".jpg")

    try {
        # Download binario seguro via -OutFile (evita corrupcao de encoding)
        Invoke-WebRequest `
            -Uri "$ELAINE_URL/storage/v1/object/fotos/$([Uri]::EscapeDataString($name))" `
            -Headers $ELAINE_HDR `
            -OutFile $tempFile

        $bytes = [System.IO.File]::ReadAllBytes($tempFile)

        # Upload com upsert (idempotente — safe para rerun)
        Invoke-RestMethod -Method Post `
            -Uri "$BREVES_URL/storage/v1/object/fotos/$([Uri]::EscapeDataString($name))" `
            -Headers ($BREVES_HDR + @{ "Content-Type" = "image/jpeg"; "x-upsert" = "true" }) `
            -Body $bytes | Out-Null

        $success++
        if ($success % 20 -eq 0) {
            Write-Host "  $success/$($sourceFiles.Count) copiados..." -ForegroundColor DarkGray
        }
    }
    catch {
        $failed++
        $failures.Add($name)
        Write-Host "  ERRO: $name - $($_.Exception.Message)" -ForegroundColor Red
    }
    finally {
        if (Test-Path $tempFile) { Remove-Item $tempFile -ErrorAction SilentlyContinue }
    }
}

# --- Resultado ---
Write-Host ""
Write-Host "=== Resultado da copia ===" -ForegroundColor Cyan
Write-Host "  Origem listada : $($sourceFiles.Count)"
Write-Host "  Copiados       : $success" -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "  Falhas         : $failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Arquivos com falha:" -ForegroundColor Red
    foreach ($f in $failures) { Write-Host "    - $f" -ForegroundColor Red }
} else {
    Write-Host "  Falhas         : 0" -ForegroundColor Green
}

# --- Validacao: contar destino com paginacao ---
Write-Host ""
Write-Host "Contando objetos no destino (BREVES)..." -ForegroundColor Cyan
$destFiles = List-BucketAll $BREVES_URL $BREVES_HDR "fotos"
Write-Host "  Total no destino apos copia: $($destFiles.Count)"

if ($failed -eq 0 -and $success -eq $sourceFiles.Count) {
    Write-Host ""
    Write-Host "Migracao concluida com sucesso." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Migracao concluida com $failed falha(s). Revisar os arquivos listados acima." -ForegroundColor Yellow
    exit 1
}
