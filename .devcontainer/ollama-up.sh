#!/usr/bin/env bash
# Start `ollama serve` in the background if it is not already running (idempotent).
# With --pull: also download the model, create the short alias the app uses by default, and preload it.
set -euo pipefail

MODEL="${OLLAMA_MODEL:-medgemma:4b}"
ALIAS="${OLLAMA_MODEL_ALIAS:-medgemma}"
API="http://${OLLAMA_HOST:-127.0.0.1:11434}"
LOG=/tmp/ollama.log

# Models live under /workspaces so they survive container rebuilds (only /workspaces persists).
if [ -n "${OLLAMA_MODELS:-}" ] && [ ! -w "$(dirname "$OLLAMA_MODELS")" ]; then
  sudo mkdir -p "$OLLAMA_MODELS"
  sudo chown -R "$(id -u):$(id -g)" "$(dirname "$OLLAMA_MODELS")"
fi
mkdir -p "${OLLAMA_MODELS:-$HOME/.ollama/models}"

if ! curl -fsS "$API/api/version" >/dev/null 2>&1; then
  echo "[ollama-up] starting ollama serve (log: $LOG)"
  # nohup + setsid + redirected fds: the process outlives this lifecycle hook.
  nohup setsid ollama serve >>"$LOG" 2>&1 </dev/null &
fi

for _ in $(seq 1 60); do
  curl -fsS "$API/api/version" >/dev/null 2>&1 && break
  sleep 1
done
if ! curl -fsS "$API/api/version"; then
  echo "[ollama-up] Ollama did not come up; last log lines:" >&2
  tail -n 40 "$LOG" >&2 || true
  exit 1
fi
echo

if [ "${1:-}" = "--pull" ]; then
  echo "[ollama-up] pulling $MODEL (about 3.3 GB for medgemma:4b)"
  ollama pull "$MODEL"
  if [ -n "$ALIAS" ] && [ "$ALIAS" != "$MODEL" ]; then
    ollama cp "$MODEL" "$ALIAS"
  fi
  # An empty generate request loads the model into RAM, so the first analysis does not pay the load time.
  curl -fsS "$API/api/generate" \
    -d "{\"model\":\"$MODEL\",\"keep_alive\":\"${OLLAMA_KEEP_ALIVE:-1h}\"}" >/dev/null || true
  ollama list
fi
