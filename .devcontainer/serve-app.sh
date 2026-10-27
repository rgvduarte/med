#!/usr/bin/env bash
# Build the app and serve it with `vite preview` on port 4173 (proxying /ollama -> Ollama).
# postAttachCommand runs on every attach (e.g. a second browser tab), so do nothing if it is already up.
set -euo pipefail
PORT="${APP_PORT:-4173}"

if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/"; then
  echo "[serve-app] already serving on port ${PORT}"
  exit 0
fi

npm run build
exec npx vite preview --host 0.0.0.0 --port "$PORT" --strictPort
