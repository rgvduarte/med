/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

// GitHub Codespaces sets these; both are undefined on a normal machine and on GitHub Pages builds.
const codespace = process.env.CODESPACE_NAME
const forwardDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN // e.g. "app.github.dev"

// The page itself (https://<codespace>-<port>.app.github.dev or http://localhost:<port>).
function isOwnOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin)
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true
    return Boolean(codespace && forwardDomain && hostname.startsWith(`${codespace}-`) && hostname.endsWith(`.${forwardDomain}`))
  } catch {
    return false
  }
}

// Same-origin proxy: the browser calls /ollama/v1/chat/completions on the app's own URL and Vite
// forwards it to Ollama inside the codespace, so no CORS and no second forwarded port is needed.
const ollamaProxy: Record<string, ProxyOptions> = {
  '/ollama': {
    target: process.env.OLLAMA_PROXY_TARGET ?? 'http://127.0.0.1:11434',
    // Ollama bound to 127.0.0.1 answers 403 to any Host that is not local; send Host: 127.0.0.1:11434.
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/ollama/, ''),
    configure: (proxy) => {
      // Browsers send Origin on POST. Ollama answers 403 to origins outside OLLAMA_ORIGINS, so drop it
      // for requests coming from this app's own page; foreign origins keep it and are still refused.
      proxy.on('proxyReq', (proxyReq, req) => {
        const origin = req.headers.origin
        if (typeof origin === 'string' && isOwnOrigin(origin)) proxyReq.removeHeader('origin')
      })
    },
  },
}

// Vite answers 403 to unknown Host headers; allow the Codespaces forwarding domain only when in a codespace.
const allowedHosts = forwardDomain ? [`.${forwardDomain}`] : []

// Relative base so the build works both at https://<user>.github.io/<repo>/ and locally.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { proxy: ollamaProxy, allowedHosts },
  preview: { proxy: ollamaProxy, allowedHosts },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
