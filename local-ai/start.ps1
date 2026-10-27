<#
  MSK-VLM - IA local (Ollama + MedGemma) para Windows 10 22H2+ / 11.
  (Mensagens sem acentos de proposito: o Windows PowerShell 5.1 le ficheiros .ps1 sem BOM como ANSI.)

  Uso (PowerShell, na pasta do repositorio):
    powershell -ExecutionPolicy Bypass -File .\local-ai\start.ps1            # instala/verifica Ollama, modelo e CORS
    powershell -ExecutionPolicy Bypass -File .\local-ai\start.ps1 -Serve     # ... e serve a aplicacao em http://localhost:8080
    powershell -ExecutionPolicy Bypass -File .\local-ai\start.ps1 -Update    # volta a transferir o modelo base
#>
[CmdletBinding()]
param(
  [switch]$Serve,
  [switch]$Update,
  [string]$BaseModel = $(if ($env:BASE_MODEL) { $env:BASE_MODEL } else { 'medgemma1.5:4b' }),
  [string]$LocalModel = $(if ($env:LOCAL_MODEL) { $env:LOCAL_MODEL } else { 'medgemma' }),
  [int]$NumCtx = 16384,
  [int]$AppPort = 8080
)
$ErrorActionPreference = 'Stop'
$PagesOrigin = 'https://rgvduarte.github.io'
$OllamaUrl = 'http://127.0.0.1:11434'
$Here = $PSScriptRoot
$OllamaDir = Join-Path $env:LOCALAPPDATA 'Programs\Ollama'

function Info([string]$m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Warn([string]$m) { Write-Host "[aviso] $m" -ForegroundColor Yellow }
function Fail([string]$m) { Write-Host "[erro] $m" -ForegroundColor Red; exit 1 }
function Ask([string]$q) { (Read-Host "$q [s/N]") -match '^[sSyY]$' }

function Test-Server {
  try { Invoke-WebRequest -Uri "$OllamaUrl/api/version" -UseBasicParsing -TimeoutSec 3 | Out-Null; return $true } catch { return $false }
}
# O Ollama responde 403 a origens nao autorizadas (OLLAMA_ORIGINS).
function Test-Cors {
  try {
    $r = Invoke-WebRequest -Uri "$OllamaUrl/api/version" -Headers @{ Origin = $PagesOrigin } -UseBasicParsing -TimeoutSec 3
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}
function Wait-Server { for ($i = 0; $i -lt 40; $i++) { if (Test-Server) { return $true }; Start-Sleep -Seconds 1 }; return $false }
# Executa um programa externo sem que o stderr redirecionado termine o script (Windows PowerShell 5.1).
function Invoke-Native([string]$exe, [string[]]$argv, [switch]$Quiet) {
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { if ($Quiet) { & $exe @argv *> $null } else { & $exe @argv | Out-Host } } finally { $ErrorActionPreference = $old }
  return $LASTEXITCODE
}
function Merge-Origins([string]$current) {
  if (-not $current) { return $PagesOrigin }
  if (($current -split ',') -contains $PagesOrigin) { return $current }
  return "$current,$PagesOrigin"
}

# 1. Ollama instalado? -------------------------------------------------------------------------
if (-not (Get-Command ollama -ErrorAction SilentlyContinue) -and (Test-Path (Join-Path $OllamaDir 'ollama.exe'))) {
  $env:Path = "$OllamaDir;$env:Path"
}
# Variaveis para o processo atual (herdadas pela app/servidor que este script iniciar) e para o utilizador.
$origins = Merge-Origins ([Environment]::GetEnvironmentVariable('OLLAMA_ORIGINS', 'User'))
[Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', $origins, 'User')
[Environment]::SetEnvironmentVariable('OLLAMA_NO_CLOUD', '1', 'User')
$env:OLLAMA_ORIGINS = $origins
$env:OLLAMA_NO_CLOUD = '1'

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  Warn 'O Ollama nao esta instalado (https://ollama.com/download).'
  if (-not (Ask 'Instalar agora com o instalador oficial (irm https://ollama.com/install.ps1 | iex)?')) { exit 1 }
  Invoke-RestMethod -Uri 'https://ollama.com/install.ps1' | Invoke-Expression
  $env:Path = "$OllamaDir;$env:Path"
  if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) { Fail "O comando 'ollama' continua indisponivel. Abra um novo PowerShell e repita." }
}

# 2. Servidor a correr com a origem do GitHub Pages autorizada --------------------------------
if (-not (Test-Server) -or -not (Test-Cors)) {
  Info 'A (re)iniciar o Ollama com OLLAMA_ORIGINS e OLLAMA_NO_CLOUD...'
  Get-Process -Name 'ollama app', 'ollama' -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 2
  $app = Join-Path $OllamaDir 'ollama app.exe'
  if (Test-Path $app) { Start-Process -FilePath $app }
  else { Start-Process -FilePath 'ollama' -ArgumentList 'serve' -WindowStyle Hidden }
}
if (-not (Wait-Server)) { Fail "O servidor Ollama nao respondeu em $OllamaUrl." }
if (Test-Cors) { Info "CORS: $PagesOrigin autorizado." } else { Warn "CORS: $PagesOrigin NAO autorizado (use -Serve ou veja o README)." }

# 3. Modelo ------------------------------------------------------------------------------------
if ($Update -or (Invoke-Native ollama @('show', $BaseModel) -Quiet) -ne 0) {
  Info "A transferir $BaseModel (medgemma1.5:4b = 3,3 GB; ao usar o modelo aceita os termos HAI-DEF da Google)..."
  if ((Invoke-Native ollama @('pull', $BaseModel)) -ne 0) { Fail "Falhou 'ollama pull $BaseModel'." }
}
$modelfile = Join-Path $env:TEMP 'msk-vlm.Modelfile'
Set-Content -Path $modelfile -Encoding Ascii -Value @("FROM $BaseModel", "PARAMETER num_ctx $NumCtx", 'PARAMETER temperature 0')
Info "A criar o modelo local '$LocalModel' (contexto $NumCtx tokens)..."
if ((Invoke-Native ollama @('create', $LocalModel, '-f', $modelfile) -Quiet) -ne 0) { Fail "Falhou 'ollama create $LocalModel'." }
Remove-Item $modelfile -ErrorAction SilentlyContinue

# 4. Teste: imagem + JSON estruturado pelo endpoint compativel com OpenAI ------------------------
Info 'Teste rapido (imagem + JSON Schema; o primeiro carregamento pode demorar)...'
$png = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAAAAABWESUoAAAANUlEQVR42mNg4BCQUNAwsHDwCIhIyCioaOiYMGPBig07Dpy4cOPBiw8/GEYVjCoYVTBSFQAAl2zwEJjgKNwAAAAASUVORK5CYII='
$body = @{
  model = $LocalModel; temperature = 0; max_tokens = 64; stream = $false
  messages = @(@{ role = 'user'; content = @(
        @{ type = 'text'; text = 'Is there an image attached? Answer in JSON.' },
        @{ type = 'image_url'; image_url = @{ url = "data:image/png;base64,$png" } }) })
  response_format = @{ type = 'json_schema'; json_schema = @{ name = 'ping'; strict = $true; schema = @{
        type = 'object'; properties = @{ image_received = @{ type = 'boolean' } }
        required = @('image_received'); additionalProperties = $false } } }
} | ConvertTo-Json -Depth 12
try {
  $resp = Invoke-RestMethod -Uri "$OllamaUrl/v1/chat/completions" -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 600
} catch { Fail "O teste falhou: $($_.Exception.Message)" }
if ($resp.choices[0].message.content -notmatch 'image_received') { Fail "Resposta inesperada: $($resp | ConvertTo-Json -Depth 6)" }
Info "Modelo pronto: $LocalModel"

Write-Host ''
Write-Host '  Na aplicacao, abra Definicoes e escolha:'
Write-Host '    Fornecedor : Servidor local compativel OpenAI (ex.: MedGemma)'
Write-Host '    URL base   : http://localhost:11434/v1'
Write-Host "    Modelo     : $LocalModel"
Write-Host '  GitHub Pages: https://rgvduarte.github.io/med/  (Edge/Chrome/Firefox pedem autorizacao de acesso a este dispositivo: Permitir)'

# 5. (Opcional) servir a aplicacao localmente ----------------------------------------------------
if (-not $Serve) { exit 0 }
$serveScript = Join-Path $Here 'serve.py'
if (Get-Command py -ErrorAction SilentlyContinue) { Invoke-Native py @('-3', $serveScript, '--port', "$AppPort") | Out-Null }
elseif ((Get-Command python -ErrorAction SilentlyContinue) -and (Invoke-Native python @('-c', 'import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)') -Quiet) -eq 0) {
  Invoke-Native python @($serveScript, '--port', "$AppPort") | Out-Null
}
else { Fail 'Para -Serve e necessario o Python 3 (https://www.python.org/downloads/) ou o Docker Desktop (ver README).' }
