# MSK·VLM dev container for GitHub Codespaces: Node 22 + Ollama (CPU only).
FROM mcr.microsoft.com/devcontainers/javascript-node:4-22-bookworm

# Pinned Ollama release (installer honours OLLAMA_VERSION). Bump deliberately.
ARG OLLAMA_VERSION=0.40.12

# zstd: the official installer downloads ollama-linux-amd64.tar.zst and aborts if zstd is missing.
RUN apt-get update \
    && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y --no-install-recommends zstd \
    && rm -rf /var/lib/apt/lists/*

# Official install script. In a container there is no systemd and no GPU, so it only installs
# /usr/local/bin/ollama + /usr/local/lib/ollama and exits 0 (the server is started by ollama-up.sh).
# The CUDA runtimes (~2.4 GB) are useless on Codespaces (no GPU machines) and would count against
# the storage quota, so they are removed in the same layer.
RUN curl -fsSL https://ollama.com/install.sh | OLLAMA_VERSION=${OLLAMA_VERSION} sh \
    && rm -rf /usr/local/lib/ollama/cuda_* /usr/local/lib/ollama/rocm* \
    && test -x /usr/local/bin/ollama
