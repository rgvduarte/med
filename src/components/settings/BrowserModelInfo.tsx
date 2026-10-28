import { useEffect, useState } from 'react'
import { Cpu, HardDriveDownload, ShieldAlert, Smartphone, Trash2, TriangleAlert } from 'lucide-react'
import { hasWebGpu, useSettings } from '../../store/settings'
import {
  BROWSER_MODELS,
  crashedModels,
  downloadMb,
  forgetCrashes,
  formatMb,
  isAppleMobile,
  isModelCached,
  lastCrash,
  resolveBrowserModel,
  type BrowserModelKey,
} from '../../lib/vlm/browser/models'

const CACHE_NAME = 'transformers-cache'

/** One-line status of the built-in model for the analysis panels: what downloads, and any out-of-memory notice. */
export function BrowserModelNote() {
  const s = useSettings()
  const key = resolveBrowserModel(s.browserModel)
  const [cached, setCached] = useState<boolean | null>(null)
  useEffect(() => {
    if (key) void isModelCached(key).then(setCached)
  }, [key])
  if (s.provider !== 'browser') return null
  if (!hasWebGpu()) return <p className="subtle fp-empty-hint">Este navegador não suporta WebGPU, que a IA integrada precisa. Use Chrome, Edge ou Safari 26+.</p>
  return (
    <>
      {lastCrash && (
        <div className="callout callout-warn" role="note">
          <TriangleAlert size={16} aria-hidden />
          <div>
            Na última tentativa o navegador fechou a página por falta de memória ({BROWSER_MODELS[lastCrash.model].label}).
            {key ? ` Passo a usar ${BROWSER_MODELS[key].label}.` : ' Neste aparelho a IA integrada não é possível.'}
          </div>
        </div>
      )}
      {key && cached === false && (
        <p className="subtle fp-empty-hint">
          Primeira análise: descarrega {BROWSER_MODELS[key].label} (~{formatMb(downloadMb(key))}) uma única vez; depois fica guardado neste navegador.
          Prefira Wi-Fi.
        </p>
      )}
    </>
  )
}

/** Settings panel for the built-in (in-browser, WebGPU) model. */
export function BrowserModelInfo() {
  const s = useSettings()
  const webgpu = hasWebGpu()
  const ios = isAppleMobile()
  const crashes = crashedModels()
  const resolved = resolveBrowserModel(s.browserModel)
  const autoPick = resolveBrowserModel('auto')
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

  const option = (k: BrowserModelKey) => `${BROWSER_MODELS[k].label} — ${formatMb(downloadMb(k))}${crashes[k] ? ' (falhou neste aparelho)' : ''}`

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      <div className="callout callout-info">
        <Cpu size={16} />
        <div>
          <strong>IA integrada — corre inteiramente neste dispositivo.</strong> As imagens não saem do navegador; não há chaves, contas nem servidores.
          O modelo é descarregado uma vez do Hugging Face e fica guardado no navegador.
        </div>
      </div>
      <div className="callout callout-warn">
        <ShieldAlert size={16} />
        <div>
          É um modelo pequeno e genérico, não validado em imagem musculoesquelética e não é um dispositivo médico. Nesta versão faz só a{' '}
          <strong>triagem</strong> (modalidade, região, incidência e qualidade). A ausência de alertas nunca significa «sem fratura»: todo o resultado
          exige revisão por um médico.
        </div>
      </div>

      <label className="field" style={{ marginBottom: 0 }}>
        <span>Modelo integrado</span>
        <select
          className="select"
          value={s.browserModel}
          onChange={(e) => {
            s.update({ browserModel: e.target.value, browserModelChosen: e.target.value !== 'auto' })
          }}
        >
          <option value="auto">Automático — {autoPick ? `${BROWSER_MODELS[autoPick].label} neste aparelho (${formatMb(downloadMb(autoPick))})` : 'nenhum cabe neste aparelho'}</option>
          {(Object.keys(BROWSER_MODELS) as BrowserModelKey[]).map((k) => (
            <option key={k} value={k}>
              {option(k)}
            </option>
          ))}
        </select>
        <small>
          Computador: {BROWSER_MODELS['qwen3.5-2b'].label} (Apache-2.0). Telemóvel e tablet: {BROWSER_MODELS['lfm2.5-vl-450m'].label} (
          {BROWSER_MODELS['lfm2.5-vl-450m'].licence}), porque o iOS fecha páginas que usem mais de ~1,5 GB de memória.
        </small>
      </label>

      <div className="row" style={{ gap: 8 }}>
        <span className={`badge ${webgpu ? 'badge-neutral' : 'badge-critical'}`}>
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

      {Object.keys(crashes).length > 0 && (
        <div className="callout callout-warn">
          <TriangleAlert size={16} />
          <div>
            Neste aparelho o navegador fechou a página por falta de memória com:{' '}
            {(Object.keys(crashes) as BrowserModelKey[]).map((k) => BROWSER_MODELS[k].label).join(', ')}.{' '}
            {resolved ? `O modo automático usa agora ${BROWSER_MODELS[resolved].label}.` : 'Nenhum modelo integrado cabe aqui.'}{' '}
            <button type="button" className="fp-link" onClick={() => (forgetCrashes(), s.update({}))}>
              Esquecer e tentar de novo
            </button>
          </div>
        </div>
      )}

      {ios && (
        <div className="callout callout-info">
          <Smartphone size={16} />
          <div>
            No iPhone/iPad é experimental: o Safari pode recarregar a página se faltar memória (a app passa então para um modelo mais pequeno). Para
            não voltar a descarregar o modelo, use <strong>Partilhar → Adicionar ao ecrã principal</strong>: o Safari apaga os dados de sites não
            abertos há 7 dias.
          </div>
        </div>
      )}
    </div>
  )
}
