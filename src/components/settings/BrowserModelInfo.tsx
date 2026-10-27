import { useEffect, useState } from 'react'
import { Cpu, HardDriveDownload, ShieldAlert, Trash2 } from 'lucide-react'
import { hasWebGpu } from '../../store/settings'

const CACHE_NAME = 'transformers-cache'

function isIOS(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

/** Settings panel for the experimental in-browser (WebGPU) model. */
export function BrowserModelInfo() {
  const webgpu = hasWebGpu()
  const ios = isIOS()
  const [cachedMb, setCachedMb] = useState<number | null>(null)

  const refresh = async () => {
    try {
      if (!('caches' in window) || !(await caches.has(CACHE_NAME))) return setCachedMb(0)
      const cache = await caches.open(CACHE_NAME)
      let total = 0
      for (const req of await cache.keys()) {
        const res = await cache.match(req)
        const len = Number(res?.headers.get('content-length') ?? 0)
        total += Number.isFinite(len) ? len : 0
      }
      setCachedMb(Math.round(total / 1e6))
    } catch {
      setCachedMb(null)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      <div className="callout callout-warn">
        <ShieldAlert size={16} />
        <div>
          <strong>Experimental — apenas demonstração.</strong> Um modelo pequeno (Qwen3.5 0,8B, licença Apache-2.0) corre dentro deste separador com
          WebGPU. Faz só a <strong>triagem</strong> (modalidade, região, incidência, lateralidade e qualidade). Achados, evidência e relatório exigem
          Claude ou o MedGemma (servidor local ou GitHub Codespaces).
        </div>
      </div>
      <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--fs-sm)' }}>
        <li>Sem chave e sem custos: as imagens não saem deste dispositivo. Só o modelo é descarregado do Hugging Face.</li>
        <li>
          Primeira utilização: descarga de cerca de <strong>0,8 GB</strong>, guardada na cache do navegador para as seguintes.
        </li>
        <li>Requer um computador com Chrome ou Edge recentes (ou Safari 26+ no Mac) e uma GPU com WebGPU.</li>
      </ul>
      <div className="row" style={{ gap: 8 }}>
        <span className={`badge ${webgpu ? 'badge-normal' : 'badge-critical'}`}>
          <Cpu size={12} /> WebGPU {webgpu ? 'disponível' : 'indisponível neste navegador'}
        </span>
        {cachedMb !== null && (
          <span className="badge badge-neutral">
            <HardDriveDownload size={12} /> {cachedMb > 0 ? `Modelo em cache: ${cachedMb} MB` : 'Modelo ainda não descarregado'}
          </span>
        )}
        {cachedMb !== null && cachedMb > 0 && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={async () => {
              await caches.delete(CACHE_NAME).catch(() => undefined)
              void refresh()
            }}
          >
            <Trash2 size={14} /> Remover modelo da cache
          </button>
        )}
      </div>
      {ios && (
        <div className="callout callout-info">
          <ShieldAlert size={16} />
          <div>No iPhone/iPad o navegador limita a memória a menos do que o modelo precisa. Use um computador, ou o GitHub Codespaces.</div>
        </div>
      )}
    </div>
  )
}
