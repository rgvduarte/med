/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin, type ProxyOptions } from 'vite'

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

// Only what the app uses goes through: Ollama's admin API (pull/create/delete models, …) stays unreachable.
const OLLAMA_ALLOWED: Record<string, string> = {
  '/ollama/v1/chat/completions': 'POST',
  '/ollama/v1/models': 'GET',
}

// Same-origin proxy: the browser calls /ollama/v1/chat/completions on the app's own URL and Vite
// forwards it to Ollama inside the codespace, so no CORS and no second forwarded port is needed.
const ollamaProxy: Record<string, ProxyOptions> = {
  '/ollama': {
    target: process.env.OLLAMA_PROXY_TARGET ?? 'http://127.0.0.1:11434',
    // false → Vite answers 404 without contacting Ollama. The raw path must match exactly (no ../, no encoding).
    bypass: (req) => (OLLAMA_ALLOWED[(req.url ?? '').split('?')[0]] === req.method ? undefined : false),
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

// Content-Security-Policy (meta tag in index.html). connect-src lists every host the page talks to:
// this app, http://localhost / http://127.0.0.1 (Ollama, LM Studio, the NotebookLM bridge),
// api.anthropic.com and the Hugging Face download hosts of the in-browser model. To use an HTTPS
// endpoint of your own (a remote OpenAI-compatible server, a tunnel), build with
//   CSP_CONNECT_EXTRA="https://my-server.example" npm run build
// (space-separated origins), which appends them to connect-src.
const cspConnectExtra = (process.env.CSP_CONNECT_EXTRA ?? '')
  .split(/[\s,]+/)
  .filter((o) => /^https?:\/\/[a-z0-9*.-]+(:(\d+|\*))?$/i.test(o))

function contentSecurityPolicy(): Plugin {
  return {
    name: 'msk-vlm-csp',
    transformIndexHtml(html, ctx) {
      let out = html
      if (cspConnectExtra.length) out = out.replace(/(connect-src [^;"]*)/, `$1 ${cspConnectExtra.join(' ')}`)
      // Dev server only: Vite injects CSS as <style> elements, which style-src 'self' would block.
      if (ctx.server) out = out.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
      return out
    },
  }
}

// Relative base so the build works both at https://<user>.github.io/<repo>/ and locally.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  // The in-browser VLM runs in a module worker (Transformers.js + ONNX Runtime WebGPU).
  worker: { format: 'es' },
  server: { proxy: ollamaProxy, allowedHosts },
  preview: { proxy: ollamaProxy, allowedHosts },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
