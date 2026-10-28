import { useMemo, useState } from 'react'
import { Check, Copy, Eye, EyeOff, KeyRound, LockKeyhole, Notebook, Plug, RefreshCw, TriangleAlert, Unplug } from 'lucide-react'
import { generateBridgeKey, isNotebookConfigured, parseNotebookId, useSettings, type McpServerKind } from '../../store/settings'
import { buildBridgeCommand, isSafariBrowser, resetMcpSession } from '../../lib/evidence/mcp'
import { McpConnectionTest } from './McpConnectionTest'
import { GlassSwitch } from '../ui/glass'

function CopyButton({ text, label, compact = false, caption = 'Copiar' }: { text: string; label: string; compact?: boolean; caption?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={`btn btn-sm ${compact ? 'btn-ghost rp-copy-compact' : ''}`}
      title={compact ? 'Copiar' : undefined}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch {
          setDone(false)
        }
      }}
      aria-label={label}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
      {compact ? <span className="sr-only">{done ? 'Copiado' : 'Copiar'}</span> : done ? 'Copiado' : caption}
    </button>
  )
}

function Cmd({ children }: { children: string }) {
  return (
    <span className="rp-cmd">
      <code>{children}</code>
      <CopyButton text={children} label={`Copiar comando ${children}`} compact />
    </span>
  )
}

export function NotebookLmCard() {
  const s = useSettings()
  const [showKey, setShowKey] = useState(false)
  const safari = useMemo(() => isSafariBrowser(), [])
  const origin = typeof location !== 'undefined' ? location.origin : 'https://rgvduarte.github.io'
  const command = buildBridgeCommand({ kind: s.mcpServerKind, origin, apiKey: s.mcpApiKey, baseUrl: s.mcpBaseUrl })
  const commandPs = buildBridgeCommand({ kind: s.mcpServerKind, origin, apiKey: s.mcpApiKey, baseUrl: s.mcpBaseUrl, shell: 'powershell' })
  const configured = isNotebookConfigured(s)
  const notebookInvalid = s.notebookUrl.trim().length > 0 && !s.notebookId
  const check = s.mcpLastCheck

  const chip = !s.mcpEnabled ? (
    <span className="rp-conn off">
      <Unplug size={13} aria-hidden /> Desativado
    </span>
  ) : !configured ? (
    <span className="rp-conn off">
      <Unplug size={13} aria-hidden /> Não configurado
    </span>
  ) : check && !check.ok ? (
    <span className="rp-conn err" title={check.summary}>
      <TriangleAlert size={13} aria-hidden /> Erro
    </span>
  ) : check?.ok ? (
    <span className="rp-conn ok" title={check.summary}>
      <Plug size={13} aria-hidden /> Ligado
    </span>
  ) : (
    <span className="rp-conn warn">
      <Plug size={13} aria-hidden /> Por testar
    </span>
  )

  const change = (patch: Parameters<typeof s.update>[0]) => {
    void resetMcpSession()
    s.update({ ...patch, mcpLastCheck: undefined })
  }

  return (
    <section className="card card-pad" id="notebooklm" aria-labelledby="notebooklm-title">
      <div className="rp-card-head">
        <h2 id="notebooklm-title" className="row" style={{ gap: 8 }}>
          <Notebook size={18} aria-hidden /> NotebookLM (opcional, avançado)
        </h2>
        {chip}
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Fundamenta os relatórios na sua própria biblioteca de artigos revistos por pares. Sem esta ligação, a app usa a base de evidência integrada.
      </p>
      <p className="rp-req">
        <strong>Requisitos:</strong> computador com Chrome, Edge ou Firefox (o Safari não é suportado); Node.js 20 ou superior; uv (Python 3.11+); conta
        Google com acesso ao caderno.
      </p>

      {safari && (
        <div className="callout callout-warn" style={{ marginBottom: 'var(--sp-4)' }}>
          <TriangleAlert size={16} />
          <div>
            <strong>O Safari não é suportado.</strong> O Safari bloqueia ligações de páginas https a <code>127.0.0.1</code>. Abra esta app no Chrome, no
            Edge ou no Firefox para usar o NotebookLM; até lá, a análise usa apenas a base curada.
          </div>
        </div>
      )}

      <label className="rp-switch">
        <GlassSwitch checked={s.mcpEnabled} onCheckedChange={(v) => change({ mcpEnabled: v })} />
        <span>Usar NotebookLM durante a análise</span>
      </label>

      <fieldset className="rp-fieldset">
        <legend>Servidor MCP</legend>
        <div className="rp-radio-row">
          {(
            [
              ['nlm-cli', 'notebooklm-mcp-cli (recomendado)', 'Rápido; pesquisa sem abrir o navegador.'],
              ['legacy', 'notebooklm-mcp 2.x (legado)', 'Projeto arquivado; controla uma janela do Chrome, mais lento.'],
            ] as [McpServerKind, string, string][]
          ).map(([id, label, hint]) => (
            <label key={id} className={`rp-radio ${s.mcpServerKind === id ? 'on' : ''}`}>
              <input type="radio" name="mcp-kind" value={id} checked={s.mcpServerKind === id} onChange={() => change({ mcpServerKind: id })} />
              <span>
                <span className="rp-radio-label">{label}</span>
                <span className="rp-radio-hint">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>Caderno NotebookLM</span>
        <input
          className="input mono"
          value={s.notebookUrl}
          onChange={(e) => {
            const v = e.target.value.trim()
            change({ notebookUrl: v, notebookId: parseNotebookId(v) })
          }}
          placeholder="https://notebooklm.google.com/notebook/…"
          spellCheck={false}
          aria-invalid={notebookInvalid || undefined}
        />
        {notebookInvalid ? (
          <small className="rp-warn-text">Não encontrei o identificador do caderno neste endereço. Copie o endereço completo da barra do navegador.</small>
        ) : s.notebookId ? (
          <small>
            Identificador: <span className="mono">{s.notebookId}</span>
          </small>
        ) : (
          <small>Cole o endereço do caderno (ou só o identificador).</small>
        )}
      </label>
      <div className="rp-grid-2">
        <label className="field">
          <span>Endereço da ponte local</span>
          <input className="input mono" value={s.mcpBaseUrl} onChange={(e) => change({ mcpBaseUrl: e.target.value.trim() })} spellCheck={false} />
          <small>
            MCP em <span className="mono">/mcp</span>, verificação em <span className="mono">/healthz</span>. Use 127.0.0.1 (não localhost).
          </small>
        </label>
        <div className="field">
          <span className="rp-field-label">
            <KeyRound size={13} aria-hidden /> Chave local da ponte
          </span>
          <div className="rp-key-row">
            <input className="input mono" readOnly value={showKey ? s.mcpApiKey : `${s.mcpApiKey.slice(0, 6)}${'•'.repeat(18)}`} aria-label="Chave local da ponte" />
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'}>
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Gerar nova chave"
              title="Gerar nova chave (terá de reiniciar a ponte com o comando novo)"
              onClick={() => confirm('Gerar uma nova chave? A ponte em execução deixa de aceitar a chave antiga até a reiniciar com o comando novo.') && change({ mcpApiKey: generateBridgeKey() })}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <small>Gerada neste navegador (32 bytes aleatórios). Protege a porta local; não é uma palavra-passe de um serviço.</small>
        </div>
      </div>

      <ol className="rp-steps">
        <li>
          <strong>Prepare o caderno.</strong> Em{' '}
          <a href="https://notebooklm.google.com" target="_blank" rel="noreferrer">
            notebooklm.google.com
          </a>
          , crie um caderno, carregue os artigos (PDF) e dê a cada fonte um nome com a referência completa (Autor, Ano, Revista, DOI). Copie o endereço do
          caderno e cole-o no campo «Caderno NotebookLM».
        </li>
        <li>
          <strong>Instale as ferramentas (uma única vez).</strong>
          {s.mcpServerKind === 'legacy' ? (
            <ul>
              <li>
                Node.js 20+ (
                <a href="https://nodejs.org" target="_blank" rel="noreferrer">
                  nodejs.org
                </a>
                ) e o Google Chrome. O comando da ponte descarrega o servidor com <code>npx</code>.
              </li>
            </ul>
          ) : (
            <ul>
              <li>
                uv — macOS/Linux: <Cmd>curl -LsSf https://astral.sh/uv/install.sh | sh</Cmd>
              </li>
              <li>
                uv — Windows (PowerShell): <Cmd>{'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'}</Cmd>
              </li>
              <li>
                Depois: <Cmd>uv tool install notebooklm-mcp-cli</Cmd>
              </li>
              <li>
                Node.js 20+:{' '}
                <a href="https://nodejs.org" target="_blank" rel="noreferrer">
                  nodejs.org
                </a>
              </li>
            </ul>
          )}
        </li>
        <li>
          <strong>Inicie sessão na conta Google.</strong>{' '}
          {s.mcpServerKind === 'legacy' ? (
            <>Na primeira utilização, o servidor legado abre uma janela do Chrome para iniciar sessão (ferramenta setup_auth).</>
          ) : (
            <>
              No terminal, execute <Cmd>nlm login</Cmd> e entre com a conta que tem o caderno. Repita sempre que a app indicar «sessão Google expirada»
              (normalmente a cada 2–4 semanas).
            </>
          )}
        </li>
        <li>
          <strong>Inicie a ponte local.</strong> Copie o comando abaixo (já inclui a sua chave e o endereço desta app) e mantenha a janela do terminal aberta
          enquanto usa a app.
          <div className="rp-command">
            <div className="rp-command-head">
              <span>
                Comando gerado para <span className="mono">{origin}</span>
              </span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <CopyButton text={command} label="Copiar comando da ponte para macOS/Linux" caption="Copiar · macOS/Linux" />
                <CopyButton text={commandPs} label="Copiar comando da ponte para Windows (PowerShell)" caption="Copiar · PowerShell" />
              </span>
            </div>
            <pre>
              <code>{command}</code>
            </pre>
            <small className="subtle">
              Acima, a versão para macOS/Linux. A chave segue numa variável de ambiente (<span className="mono">SUPERGATEWAY_API_KEY</span>) e não nos
              argumentos do processo, que outros utilizadores do computador podem ver.
            </small>
          </div>
        </li>
        <li>
          <strong>Teste a ligação.</strong> Prima «Testar ligação». O navegador vai perguntar se este site pode aceder a «Apps no dispositivo» ou à «rede
          local»: escolha <strong>Permitir</strong>. Se recusou por engano, clique no ícone à esquerda do endereço → Definições do site → Permitir.
          <div style={{ marginTop: 'var(--sp-3)' }}>
            <McpConnectionTest />
          </div>
        </li>
        <li>
          <strong>Resultado esperado:</strong> «Ligado · sessão Google válida · N fontes no caderno».
        </li>
      </ol>

      <div className="callout callout-info" style={{ marginTop: 'var(--sp-4)' }}>
        <LockKeyhole size={16} />
        <div>
          <strong>Privacidade:</strong> a app envia ao NotebookLM apenas perguntas de literatura, sem nomes, datas, números de processo nem imagens. A ponte
          só aceita ligações deste computador (127.0.0.1) que apresentem a sua chave. Não exponha esta porta à Internet: daria acesso à sua conta Google.
        </div>
      </div>

      <details className="rp-details">
        <summary>Problemas frequentes</summary>
        <ul>
          <li>
            <strong>«Sem ligação»:</strong> o terminal está fechado, a porta está errada ou a permissão foi recusada.
          </li>
          <li>
            <strong>«Chave inválida»:</strong> copie de novo o comando.
          </li>
          <li>
            <strong>«Origem não autorizada»:</strong> o endereço da app mudou; gere um comando novo.
          </li>
          <li>
            <strong>«Sessão Google expirada»:</strong> execute <code>nlm login</code>.
          </li>
          <li>
            <strong>«Limite de utilização atingido»:</strong> tente mais tarde ou consulte <code>nlm usage</code>.
          </li>
          <li>
            <strong>Safari:</strong> use o Chrome, o Edge ou o Firefox.
          </li>
        </ul>
      </details>
    </section>
  )
}
