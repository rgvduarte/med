import { useState } from 'react'
import { CircleCheckBig, CircleMinus, CircleX, LoaderCircle, PlugZap, TriangleAlert } from 'lucide-react'
import { useSettings } from '../../store/settings'
import { testNotebookConnection, toNotebookCfg, type ConnectionTestResult, type McpErrorCode } from '../../lib/evidence/mcp'
import { errorMessage, nowIso } from '../../lib/util'

/** Troubleshooting entry matching each error code (same wording as the list in the card). */
const TROUBLE_HINT: Partial<Record<McpErrorCode, string>> = {
  'unsupported-browser': 'Safari: use o Chrome, o Edge ou o Firefox.',
  'no-connection': '«Sem ligação»: o terminal está fechado, a porta está errada ou a permissão foi recusada.',
  origin: '«Origem não autorizada»: o endereço da app mudou; gere um comando novo.',
  'invalid-key': '«Chave inválida»: copie de novo o comando.',
  'google-session': '«Sessão Google expirada»: execute nlm login.',
  quota: '«Limite de utilização atingido»: tente mais tarde ou consulte nlm usage.',
  'unknown-tool': 'A ponte não expõe a ferramenta: copie de novo o comando (lista de ferramentas atualizada).',
  notebook: 'Confirme o endereço do caderno e que a conta Google tem acesso a ele.',
  'session-expired': 'A ponte foi reiniciada: teste de novo.',
  timeout: 'O caderno demorou a responder: tente de novo.',
}

function StepIcon({ status }: { status: string }) {
  if (status === 'ok') return <CircleCheckBig size={15} className="rp-ok" aria-label="OK" />
  if (status === 'warn') return <TriangleAlert size={15} className="rp-warn" aria-label="Aviso" />
  if (status === 'skipped') return <CircleMinus size={15} className="subtle" aria-label="Ignorado" />
  return <CircleX size={15} className="rp-err" aria-label="Erro" />
}

/** «Testar ligação»: health → connect → server_info (auth_status) → notebook_get (title + sources). */
export function McpConnectionTest() {
  const update = useSettings((s) => s.update)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<ConnectionTestResult | null>(null)

  const run = async () => {
    setBusy(true)
    setRes(null)
    try {
      const r = await testNotebookConnection(toNotebookCfg(useSettings.getState()))
      setRes(r)
      update({ mcpLastCheck: { ok: r.ok, at: nowIso(), summary: r.summary } })
    } catch (e) {
      const summary = errorMessage(e)
      setRes({ ok: false, steps: [], summary })
      update({ mcpLastCheck: { ok: false, at: nowIso(), summary } })
    } finally {
      setBusy(false)
    }
  }

  const hint = res?.error ? (TROUBLE_HINT[res.error.code] ?? res.error.hint) : undefined

  return (
    <div className="rp-test">
      <button type="button" className="btn" onClick={run} disabled={busy}>
        {busy ? <LoaderCircle size={15} className="spin" /> : <PlugZap size={15} />} {busy ? 'A testar…' : 'Testar ligação'}
      </button>
      <div aria-live="polite">
        {res && (
          <div className={`rp-test-result ${res.ok ? 'ok' : 'err'}`}>
            <div className="rp-test-summary">
              {res.ok ? <CircleCheckBig size={16} aria-hidden /> : <CircleX size={16} aria-hidden />}
              <strong>{res.ok ? res.summary : `Erro — ${res.summary}`}</strong>
            </div>
            {res.steps.length > 0 && (
              <ol className="rp-test-steps">
                {res.steps.map((s) => (
                  <li key={s.id}>
                    <StepIcon status={s.status} />
                    <span>
                      <span className="rp-test-step">{s.label}</span>
                      {s.detail && s.detail !== res.summary && <span className="subtle"> · {s.detail}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {hint && <p className="rp-test-hint">{hint}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
