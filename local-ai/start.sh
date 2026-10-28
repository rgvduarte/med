#!/usr/bin/env bash
# MSK.ai — IA local (Ollama + MedGemma) para macOS e Linux.
#
#   ./local-ai/start.sh             instala/verifica o Ollama, transfere o modelo, cria o modelo "medgemma" e configura o CORS
#   ./local-ai/start.sh --serve     ... e serve a aplicação em http://localhost:8080 (qualquer navegador, incluindo Safari)
#   ./local-ai/start.sh --build     ... compila a aplicação a partir do código (precisa de Node.js 22) antes de a servir
#   ./local-ai/start.sh --update    volta a transferir o modelo base mesmo que já exista
#
# Variáveis opcionais: BASE_MODEL (medgemma1.5:4b) LOCAL_MODEL (medgemma) NUM_CTX (16384) APP_PORT (8080)
set -euo pipefail

BASE_MODEL="${BASE_MODEL:-medgemma1.5:4b}"
LOCAL_MODEL="${LOCAL_MODEL:-medgemma}"
NUM_CTX="${NUM_CTX:-16384}"
APP_PORT="${APP_PORT:-8080}"
PAGES_ORIGIN="https://rgvduarte.github.io"
OLLAMA_URL="http://127.0.0.1:11434"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
SERVE=0 BUILD=0 UPDATE=0

for arg in "$@"; do
  case "$arg" in
    --serve) SERVE=1 ;;
    --build) BUILD=1; SERVE=1 ;;
    --update) UPDATE=1 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Opção desconhecida: $arg (use --help)" >&2; exit 2 ;;
  esac
done

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[aviso]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[erro]\033[0m %s\n' "$*" >&2; exit 1; }
ask()  { local r=""; read -r -p "$1 [s/N] " r || true; [[ "$r" =~ ^[sSyY]$ ]]; }

server_up() { curl -fsS -m 3 "$OLLAMA_URL/api/version" >/dev/null 2>&1; }
# O Ollama responde 403 a pedidos cuja origem não está autorizada (OLLAMA_ORIGINS).
cors_ok()   { [ "$(curl -s -m 3 -o /dev/null -w '%{http_code}' -H "Origin: $PAGES_ORIGIN" "$OLLAMA_URL/api/version")" = "200" ]; }
wait_up()   { local _; for _ in $(seq 1 40); do server_up && return 0; sleep 1; done; return 1; }
merge_origins() { # $1 = valor atual (pode ser vazio)
  case ",$1," in *",$PAGES_ORIGIN,"*) printf '%s' "$1" ;; ",,") printf '%s' "$PAGES_ORIGIN" ;; *) printf '%s,%s' "$1" "$PAGES_ORIGIN" ;; esac
}

command -v curl >/dev/null 2>&1 || die "É necessário o 'curl'."
OS="$(uname -s)"
MAC_APP="/Applications/Ollama.app"

# 1. Ollama instalado? -----------------------------------------------------------------------
if ! command -v ollama >/dev/null 2>&1 && [ -x "$MAC_APP/Contents/Resources/ollama" ]; then
  export PATH="$MAC_APP/Contents/Resources:$PATH"
fi
if ! command -v ollama >/dev/null 2>&1; then
  warn "O Ollama não está instalado (https://ollama.com/download)."
  ask "Instalar agora com o instalador oficial (curl -fsSL https://ollama.com/install.sh | sh)?" || exit 1
  if [ "$OS" = "Darwin" ]; then
    curl -fsSL https://ollama.com/install.sh | OLLAMA_NO_START=1 sh
    export PATH="$MAC_APP/Contents/Resources:$PATH"
  else
    curl -fsSL https://ollama.com/install.sh | sh
  fi
  command -v ollama >/dev/null 2>&1 || die "O comando 'ollama' continua indisponível. Abra um novo terminal e repita."
fi

# 2. Servidor a correr, com a origem do GitHub Pages autorizada -----------------------------
# (Para a aplicação servida em http://localhost:* nada disto é preciso: o Ollama já a autoriza.)
if [ "$OS" = "Darwin" ] && [ -d "$MAC_APP" ]; then
  if ! server_up || ! cors_ok; then
    info "A configurar o Ollama (OLLAMA_ORIGINS, OLLAMA_NO_CLOUD) e a reiniciar a aplicação…"
    launchctl setenv OLLAMA_ORIGINS "$(merge_origins "$(launchctl getenv OLLAMA_ORIGINS || true)")"
    launchctl setenv OLLAMA_NO_CLOUD 1
    pkill -x Ollama 2>/dev/null || true
    sleep 2
    open -a Ollama --args hidden
  fi
elif [ "$OS" = "Linux" ] && command -v systemctl >/dev/null 2>&1 && systemctl cat ollama.service >/dev/null 2>&1; then
  if ! server_up || ! cors_ok; then
    DROPIN=/etc/systemd/system/ollama.service.d/msk-vlm.conf
    info "O serviço systemd 'ollama' precisa de OLLAMA_ORIGINS=$PAGES_ORIGIN (ficheiro $DROPIN, requer sudo)."
    if ask "Criar/atualizar $DROPIN e reiniciar o serviço?"; then
      sudo mkdir -p "$(dirname "$DROPIN")"
      printf '[Service]\nEnvironment="OLLAMA_ORIGINS=%s"\nEnvironment="OLLAMA_NO_CLOUD=1"\n' "$PAGES_ORIGIN" | sudo tee "$DROPIN" >/dev/null
      sudo systemctl daemon-reload
      sudo systemctl restart ollama
    else
      warn "Sem esta alteração a aplicação só funciona servida localmente (--serve)."
      server_up || sudo systemctl start ollama
    fi
  fi
else
  if ! server_up; then
    info "A iniciar 'ollama serve' em segundo plano (registo: $HERE/.ollama-serve.log)…"
    OLLAMA_ORIGINS="$(merge_origins "${OLLAMA_ORIGINS:-}")" OLLAMA_NO_CLOUD=1 \
      nohup ollama serve >"$HERE/.ollama-serve.log" 2>&1 &
  elif ! cors_ok; then
    warn "Já existe um servidor Ollama sem OLLAMA_ORIGINS=$PAGES_ORIGIN. Reinicie-o com essa variável para usar o GitHub Pages."
  fi
fi
wait_up || die "O servidor Ollama não respondeu em $OLLAMA_URL."
if cors_ok; then info "CORS: $PAGES_ORIGIN autorizado."; else warn "CORS: $PAGES_ORIGIN NÃO autorizado (use --serve ou veja o README)."; fi

# 3. Modelo ----------------------------------------------------------------------------------
if [ "$UPDATE" = 1 ] || ! ollama show "$BASE_MODEL" >/dev/null 2>&1; then
  info "A transferir $BASE_MODEL (medgemma1.5:4b ≈ 3,3 GB; ao usar o modelo aceita os termos HAI-DEF da Google)…"
  ollama pull "$BASE_MODEL"
fi
MODELFILE="$(mktemp)"
trap 'rm -f "$MODELFILE"' EXIT
printf 'FROM %s\nPARAMETER num_ctx %s\nPARAMETER temperature 0\n' "$BASE_MODEL" "$NUM_CTX" >"$MODELFILE"
info "A criar o modelo local '$LOCAL_MODEL' (contexto $NUM_CTX tokens)…"
ollama create "$LOCAL_MODEL" -f "$MODELFILE" >/dev/null
rm -f "$MODELFILE"

# 4. Teste: imagem + JSON estruturado pelo endpoint compatível com OpenAI ----------------------
info "Teste rápido (imagem + JSON Schema; o primeiro carregamento pode demorar)…"
PNG="iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAAAAABWESUoAAAANUlEQVR42mNg4BCQUNAwsHDwCIhIyCioaOiYMGPBig07Dpy4cOPBiw8/GEYVjCoYVTBSFQAAl2zwEJjgKNwAAAAASUVORK5CYII="
read -r -d '' BODY <<JSON || true
{"model":"$LOCAL_MODEL","temperature":0,"max_tokens":64,"stream":false,
 "messages":[{"role":"user","content":[
   {"type":"text","text":"Is there an image attached? Answer in JSON."},
   {"type":"image_url","image_url":{"url":"data:image/png;base64,$PNG"}}]}],
 "response_format":{"type":"json_schema","json_schema":{"name":"ping","strict":true,
   "schema":{"type":"object","properties":{"image_received":{"type":"boolean"}},"required":["image_received"],"additionalProperties":false}}}}
JSON
RESP="$(curl -fsS -m 600 "$OLLAMA_URL/v1/chat/completions" -H 'Content-Type: application/json' -d "$BODY")" \
  || die "O teste falhou. Veja 'ollama ps' e o registo do servidor."
case "$RESP" in *image_received*) info "Modelo pronto: $LOCAL_MODEL" ;; *) die "Resposta inesperada: $RESP" ;; esac

cat <<EOF

  Na aplicação, abra Definições e escolha:
    Fornecedor : Servidor local compatível OpenAI (ex.: MedGemma)
    URL base   : http://localhost:11434/v1
    Modelo     : $LOCAL_MODEL

  GitHub Pages: https://rgvduarte.github.io/med/  (Chrome/Edge/Firefox pedem autorização de acesso a este dispositivo: Permitir)
EOF

# 5. (Opcional) servir a aplicação localmente ---------------------------------------------------
[ "$SERVE" = 1 ] || exit 0
if [ "$BUILD" = 1 ]; then
  command -v npm >/dev/null 2>&1 || die "Para --build é necessário o Node.js 22 (npm)."
  info "A compilar a aplicação…"
  (cd "$REPO" && npm ci --no-audit --no-fund && npm run build)
fi
command -v python3 >/dev/null 2>&1 || die "Para servir a aplicação é necessário o python3 (ou use o Docker: ver README)."
exec python3 "$HERE/serve.py" --port "$APP_PORT"
