import { useState } from 'react'
import { Cpu, FileText, KeyRound, LockKeyhole, Notebook, RotateCcw, ShieldAlert, UserRound } from 'lucide-react'
import { useSettings, type Effort, type Provider } from '../store/settings'
import { NotebookLmCard } from '../components/settings/NotebookLmCard'
import { UserCard } from '../components/settings/UserCard'
import { BrowserModelInfo } from '../components/settings/BrowserModelInfo'
import '../styles/report.css'

const SECTIONS = [
  { id: 'modelo', label: 'Modelo', icon: <Cpu size={14} aria-hidden /> },
  { id: 'notebooklm', label: 'NotebookLM', icon: <Notebook size={14} aria-hidden /> },
  { id: 'relatorio', label: 'Relatório', icon: <FileText size={14} aria-hidden /> },
  { id: 'utilizador', label: 'Utilizador', icon: <UserRound size={14} aria-hidden /> },
]

function SectionNav() {
  return (
    <nav className="rp-section-nav" aria-label="Secções das definições">
      {SECTIONS.map((x) => (
        <button key={x.id} type="button" className="btn btn-sm btn-ghost" onClick={() => document.getElementById(x.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          {x.icon} {x.label}
        </button>
      ))}
    </nav>
  )
}

const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 — maior qualidade (recomendado)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — equilíbrio velocidade/qualidade' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 — mais rápido e económico' },
]

const EFFORTS: { id: Effort; label: string }[] = [
  { id: 'medium', label: 'Médio' },
  { id: 'high', label: 'Alto (recomendado)' },
  { id: 'xhigh', label: 'Muito alto' },
  { id: 'max', label: 'Máximo' },
]

export function Settings() {
  const s = useSettings()
  const [showKey, setShowKey] = useState(false)

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h1>Definições</h1>
          <p>Ligação ao modelo de visão-linguagem, ao NotebookLM, preferências do relatório e identificação local.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => confirm('Repor todas as definições e apagar a chave guardada? A chave da ponte NotebookLM também é substituída.') && s.reset()}>
          <RotateCcw size={15} /> Repor
        </button>
      </div>

      <SectionNav />

      <section className="card card-pad" id="modelo" aria-labelledby="modelo-title">
        <h2 id="modelo-title" className="row" style={{ gap: 8 }}>
          <Cpu size={18} aria-hidden /> Modelo de visão-linguagem (VLM)
        </h2>
        <div className="row rp-provider" role="radiogroup" aria-label="Fornecedor" style={{ marginBottom: 'var(--sp-4)' }}>
          {(
            [
              ['anthropic', 'Claude (API Anthropic)'],
              ['openai-compatible', 'MedGemma local / Codespaces'],
              ['browser', 'No navegador (experimental)'],
            ] as [Provider, string][]
          ).map(([id, label]) => (
            <button key={id} role="radio" aria-checked={s.provider === id} className={`btn ${s.provider === id ? 'btn-primary' : ''}`} onClick={() => s.update({ provider: id })}>
              {label}
            </button>
          ))}
        </div>

        {s.provider === 'anthropic' ? (
          <>
            <label className="field">
              <span className="row" style={{ gap: 6 }}>
                <KeyRound size={14} /> Chave da API Anthropic
              </span>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input
                  className="input mono"
                  type={showKey ? 'text' : 'password'}
                  value={s.apiKey}
                  onChange={(e) => s.setApiKey(e.target.value.trim())}
                  placeholder="sk-ant-…"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button className="btn btn-ghost" onClick={() => setShowKey((v) => !v)}>
                  {showKey ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              <small>
                A chave é usada diretamente pelo seu navegador para falar com api.anthropic.com — nunca passa por outro servidor. Por omissão fica só
                nesta sessão do separador.
              </small>
            </label>
            <label className="rp-checkbox" style={{ marginBottom: 'var(--sp-4)' }}>
              <input type="checkbox" checked={s.rememberKey} onChange={(e) => s.update({ rememberKey: e.target.checked })} />
              <span>Lembrar a chave neste dispositivo (localStorage). Use apenas em computadores pessoais.</span>
            </label>
            <div className="grid-2">
              <label className="field">
                <span>Modelo</span>
                <select className="select" value={s.anthropicModel} onChange={(e) => s.update({ anthropicModel: e.target.value })}>
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Esforço de raciocínio</span>
                <select className="select" value={s.effort} onChange={(e) => s.update({ effort: e.target.value as Effort })}>
                  {EFFORTS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <small>Mais esforço = análise mais cuidada, mais lenta e mais cara.</small>
              </label>
            </div>
            <div className="callout callout-info">
              <LockKeyhole size={16} />
              <div>
                Antes de enviar imagens de doentes reais para um fornecedor de IA, confirme a base legal (RGPD), o acordo de tratamento de dados e a
                política da sua instituição. Prefira imagens anonimizadas.
              </div>
            </div>
          </>
        ) : s.provider === 'browser' ? (
          <BrowserModelInfo />
        ) : (
          <>
            <div className="grid-2">
              <label className="field">
                <span>URL base (compatível OpenAI)</span>
                <input className="input mono" value={s.localBaseUrl} onChange={(e) => s.update({ localBaseUrl: e.target.value.trim() })} />
                <small>Ollama: http://localhost:11434/v1 · LM Studio: http://localhost:1234/v1 · GitHub Codespaces: /ollama/v1</small>
              </label>
              <label className="field">
                <span>Modelo</span>
                <input className="input mono" value={s.localModel} onChange={(e) => s.update({ localModel: e.target.value.trim() })} />
                <small>Ex.: um modelo multimodal como o MedGemma 4B/27B.</small>
              </label>
            </div>
            <div className="callout callout-info">
              <LockKeyhole size={16} />
              <div>
                {s.localBaseUrl.startsWith('/') ? (
                  <>
                    A correr no GitHub Codespaces: as imagens vão do navegador para a sua máquina virtual no GitHub (não para um fornecedor de IA).
                    Use apenas imagens anonimizadas. Num CPU, cada etapa pode demorar vários minutos — o modo local envia no máximo 4 imagens.
                  </>
                ) : (
                  <>
                    Com um modelo no seu computador as imagens não saem da máquina. O servidor tem de permitir pedidos desta origem (CORS), por exemplo{' '}
                    <code>OLLAMA_ORIGINS={location.origin}</code>. O Safari bloqueia pedidos a <code>localhost</code> a partir de sites https: use
                    Chrome, Edge ou Firefox, ou abra a app localmente (ver <code>local-ai/</code> no repositório).
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      <NotebookLmCard />

      <section className="card card-pad" id="relatorio" aria-labelledby="relatorio-title">
        <h2 id="relatorio-title" className="row" style={{ gap: 8 }}>
          <FileText size={18} aria-hidden /> Relatório e processamento
        </h2>
        <div className="grid-2">
          <label className="field">
            <span>Língua do relatório</span>
            <select className="select" value={s.reportLanguage} onChange={(e) => s.update({ reportLanguage: e.target.value as 'pt-PT' | 'en' })}>
              <option value="pt-PT">Português (Portugal)</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="field">
            <span>Máx. de fotogramas-chave por vídeo</span>
            <input
              className="input"
              type="number"
              min={4}
              max={32}
              value={s.maxKeyframes}
              onChange={(e) => s.update({ maxKeyframes: Math.max(4, Math.min(32, Number(e.target.value) || 12)) })}
            />
            <small>Usados na análise de clips de ecografia/fluoroscopia.</small>
          </label>
        </div>
        <div className="callout callout-warn">
          <ShieldAlert size={16} />
          <div>Os estudos carregados ficam apenas em memória e desaparecem ao recarregar a página. Exporte o relatório antes de sair.</div>
        </div>
      </section>

      <UserCard />
    </div>
  )
}
