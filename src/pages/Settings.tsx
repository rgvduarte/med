import { useState } from 'react'
import { Cpu, KeyRound, LockKeyhole, MessageSquareQuote, RotateCcw, ShieldAlert } from 'lucide-react'
import { useSettings, type Effort, type Provider } from '../store/settings'
import { McpConnectionTest } from '../components/settings/McpConnectionTest'

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
          <p>Ligação ao modelo de visão-linguagem, ao NotebookLM e preferências do relatório.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => confirm('Repor todas as definições e apagar a chave guardada?') && s.reset()}>
          <RotateCcw size={15} /> Repor
        </button>
      </div>

      <section className="card card-pad">
        <h2 className="row" style={{ gap: 8 }}>
          <Cpu size={18} /> Modelo de visão-linguagem (VLM)
        </h2>
        <div className="row" role="radiogroup" aria-label="Fornecedor" style={{ marginBottom: 'var(--sp-4)' }}>
          {(
            [
              ['anthropic', 'Claude (API Anthropic)'],
              ['openai-compatible', 'Servidor local compatível OpenAI (ex.: MedGemma)'],
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
            <label className="row" style={{ gap: 8, marginBottom: 'var(--sp-4)', fontSize: 'var(--fs-sm)' }}>
              <input type="checkbox" checked={s.rememberKey} onChange={(e) => s.update({ rememberKey: e.target.checked })} />
              Lembrar a chave neste dispositivo (localStorage). Use apenas em computadores pessoais.
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
        ) : (
          <>
            <div className="grid-2">
              <label className="field">
                <span>URL base (compatível OpenAI)</span>
                <input className="input mono" value={s.localBaseUrl} onChange={(e) => s.update({ localBaseUrl: e.target.value.trim() })} />
                <small>Ollama: http://localhost:11434/v1 · LM Studio: http://localhost:1234/v1</small>
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
                Com um modelo local as imagens nunca saem do seu computador. O servidor tem de permitir pedidos desta origem (CORS), por exemplo{' '}
                <code>OLLAMA_ORIGINS=https://rgvduarte.github.io</code>.
              </div>
            </div>
          </>
        )}
      </section>

      <section className="card card-pad">
        <h2 className="row" style={{ gap: 8 }}>
          <MessageSquareQuote size={18} /> Literatura — NotebookLM via MCP
        </h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Ligue um caderno NotebookLM com as suas fontes revistas por pares. Cada achado gera uma pergunta ao caderno; as respostas (com as
          fontes citadas) são usadas como evidência no relatório, em conjunto com a base curada.
        </p>
        <label className="row" style={{ gap: 8, marginBottom: 'var(--sp-4)' }}>
          <input type="checkbox" checked={s.mcpEnabled} onChange={(e) => s.update({ mcpEnabled: e.target.checked })} />
          Usar NotebookLM durante a análise
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Endpoint MCP (Streamable HTTP)</span>
            <input className="input mono" value={s.mcpUrl} onChange={(e) => s.update({ mcpUrl: e.target.value.trim() })} />
          </label>
          <label className="field">
            <span>Ferramenta MCP</span>
            <input className="input mono" value={s.mcpToolName} onChange={(e) => s.update({ mcpToolName: e.target.value.trim() })} />
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>URL do caderno NotebookLM (opcional)</span>
            <input className="input mono" value={s.notebookUrl} onChange={(e) => s.update({ notebookUrl: e.target.value.trim() })} placeholder="https://notebooklm.google.com/notebook/…" />
          </label>
        </div>
        <McpConnectionTest />
        <details style={{ marginTop: 'var(--sp-4)' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Como ligar o NotebookLM (passo a passo)</summary>
          <div className="prose" style={{ marginTop: 'var(--sp-3)' }}>
            <ol>
              <li>
                Crie um caderno em <a href="https://notebooklm.google.com" target="_blank" rel="noreferrer">notebooklm.google.com</a> e carregue as
                fontes (PDFs de artigos, guidelines). Pode exportar a lista de referências curadas na página <a href="#/metodo">Método</a>.
              </li>
              <li>
                No seu computador, execute um servidor MCP do NotebookLM exposto por HTTP com CORS para esta origem, por exemplo:
                <pre>{`npx -y supergateway --stdio "npx -y notebooklm-mcp@latest" \\
  --outputTransport streamableHttp --port 8000 \\
  --cors https://rgvduarte.github.io`}</pre>
              </li>
              <li>Na primeira utilização, o servidor abre o Chrome para iniciar sessão na sua conta Google.</li>
              <li>
                Indique aqui o endpoint (<code>http://localhost:8000/mcp</code>), clique em <strong>Testar ligação</strong> e permita o acesso à rede
                local se o navegador perguntar.
              </li>
            </ol>
          </div>
        </details>
      </section>

      <section className="card card-pad">
        <h2>Relatório e processamento</h2>
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
    </div>
  )
}
