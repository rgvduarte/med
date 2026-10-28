#!/usr/bin/env python3
"""Serve a aplicação MSK.ai em http://localhost:8080, apenas neste computador (127.0.0.1).

Uso:  python3 local-ai/serve.py [--port 8080] [--dir PASTA] [--download]

Sem --dir usa, por esta ordem: ../dist (compilado com `npm run build`), a cópia guardada em
local-ai/.app-cache/, ou transfere a versão publicada (ramo gh-pages do GitHub) para essa pasta.
Só a primeira transferência precisa de Internet; depois funciona offline.
"""
import argparse
import functools
import http.server
import io
import mimetypes
import os
import shutil
import sys
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
CACHE = os.path.join(HERE, ".app-cache")
PAGES_ZIP = "https://github.com/rgvduarte/med/archive/refs/heads/gh-pages.zip"

# O Windows pode mapear .js para text/plain no registo, o que impede os módulos ES de carregar.
for ext, mime in {".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
                  ".svg": "image/svg+xml", ".json": "application/json", ".wasm": "application/wasm",
                  ".woff2": "font/woff2", ".woff": "font/woff"}.items():
    mimetypes.add_type(mime, ext)


def cached_build():
    if os.path.isdir(CACHE):
        for name in sorted(os.listdir(CACHE)):
            path = os.path.join(CACHE, name)
            if os.path.isfile(os.path.join(path, "index.html")):
                return path
    return None


def download():
    print(f"A transferir a versão publicada da aplicação ({PAGES_ZIP})…", flush=True)
    with urllib.request.urlopen(PAGES_ZIP, timeout=120) as resp:
        data = resp.read()
    shutil.rmtree(CACHE, ignore_errors=True)
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        archive.extractall(CACHE)
    path = cached_build()
    if not path:
        sys.exit("Arquivo inesperado: não foi encontrado index.html.")
    return path


def pick_root(args):
    if args.dir:
        return os.path.abspath(args.dir)
    if args.download:
        return download()
    dist = os.path.join(REPO, "dist")
    if os.path.isfile(os.path.join(dist, "index.html")):
        return dist
    return cached_build() or download()


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):  # silencioso
        pass


def main():
    ap = argparse.ArgumentParser(description="Serve a aplicação MSK.ai localmente.")
    ap.add_argument("--port", type=int, default=int(os.environ.get("APP_PORT", "8080")))
    ap.add_argument("--dir", help="pasta com index.html (por omissão: ../dist ou a versão publicada)")
    ap.add_argument("--download", action="store_true", help="voltar a transferir a versão publicada")
    args = ap.parse_args()

    root = pick_root(args)
    if not os.path.isfile(os.path.join(root, "index.html")):
        sys.exit(f"Não existe index.html em {root}")
    handler = functools.partial(Handler, directory=root)
    try:
        httpd = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    except OSError as e:
        sys.exit(f"Não foi possível usar a porta {args.port}: {e}. Tente --port 8090.")
    print(f"A servir {root}", flush=True)
    print(f"Abra http://localhost:{args.port}/  (Ctrl+C para terminar)", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
