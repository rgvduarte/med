import { useState } from 'react'
import { BadgeCheck, Check, Copy, FileJson, FileText, Pencil, Printer, ShieldAlert } from 'lucide-react'
import type { Case, Report } from '../../types'
import { useCases } from '../../store/cases'
import { citedEvidence, reportStrings, reportToText } from '../../lib/report/format'
import { downloadJson, toFhirDiagnosticReport } from '../../lib/report/fhir'
import { formatDateTime, nowIso } from '../../lib/util'
import { MODALITY_LABEL, REGION_LABEL } from '../../lib/labels'

/** Renders "[id]" citation markers as superscript links. */
function Cited({ text }: { text: string }) {
  const parts = text.split(/(\[[A-Za-z0-9._-]+\])/g)
  return (
    <>
      {parts.map((p, i) =>
        /^\[[A-Za-z0-9._-]+\]$/.test(p) ? (
          <a key={i} className="cite" href={`#ref-${p.slice(1, -1)}`} onClick={(e) => e.preventDefault()} title={p.slice(1, -1)}>
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

export function ReportDocument({ c, r }: { c: Case; r: Report }) {
  const t = reportStrings(r)
  const refs = citedEvidence(r, c.analysis?.evidence ?? [])
  return (
    <article className="report-doc">
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2>{t.title}</h2>
          <div className="subtle" style={{ fontSize: 'var(--fs-sm)' }}>
            <span className="mono">{c.pseudoId}</span>
            {c.ageYears ? ` · ${c.ageYears} anos` : ''}
            {c.sex ? ` · ${c.sex}` : ''} · {c.series.map((s) => `${MODALITY_LABEL[s.modality]} ${REGION_LABEL[s.region].toLowerCase()}`).join(', ')}
          </div>
        </div>
        {r.status === 'validated' ? (
          <span className="badge badge-normal" style={{ alignSelf: 'flex-start' }}>
            <BadgeCheck size={13} /> Validado
          </span>
        ) : (
          <span className="badge badge-ai" style={{ alignSelf: 'flex-start' }}>
            Rascunho IA
          </span>
        )}
      </header>
      {r.status !== 'validated' && (
        <div className="callout callout-ai" style={{ marginTop: 12 }}>
          <ShieldAlert size={15} />
          <div>{t.draft}</div>
        </div>
      )}
      <h3>{t.indication}</h3>
      <p>{r.clinicalIndication || '—'}</p>
      <h3>{t.technique}</h3>
      <p>
        <Cited text={r.technique} />
      </p>
      {r.comparison && (
        <>
          <h3>{t.comparison}</h3>
          <p>{r.comparison}</p>
        </>
      )}
      <h3>{t.findings}</h3>
      {r.findingsByRegion.map((f, i) => (
        <p key={i}>
          <strong>{f.heading}.</strong> <Cited text={f.text} />
        </p>
      ))}
      <h3>{t.impression}</h3>
      <ol>
        {r.impression.map((x, i) => (
          <li key={i} style={{ fontWeight: 550 }}>
            <Cited text={x} />
          </li>
        ))}
      </ol>
      {r.recommendations.length > 0 && (
        <>
          <h3>{t.recommendations}</h3>
          <ul>
            {r.recommendations.map((x, i) => (
              <li key={i}>
                <Cited text={x} />
              </li>
            ))}
          </ul>
        </>
      )}
      {r.limitations && (
        <>
          <h3>{t.limitations}</h3>
          <p className="muted">
            <Cited text={r.limitations} />
          </p>
        </>
      )}
      {refs.length > 0 && (
        <>
          <h3>{t.references}</h3>
          <ol style={{ fontSize: 'var(--fs-sm)', listStyle: 'none', paddingLeft: 0 }}>
            {refs.map((e) => (
              <li key={e.id} id={`ref-${e.id}`} style={{ marginBottom: 4 }}>
                <span className="mono" style={{ color: 'var(--accent)' }}>
                  [{e.id}]
                </span>{' '}
                {e.citation}
                {e.doi && (
                  <>
                    {' '}
                    <a href={`https://doi.org/${e.doi}`} target="_blank" rel="noreferrer">
                      doi:{e.doi}
                    </a>
                  </>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
      <footer className="subtle" style={{ marginTop: 24, fontSize: 'var(--fs-xs)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
        <div>
          {t.generated}: {r.generatedBy} · {formatDateTime(r.generatedAt)}
          {r.editedByClinician ? ' · editado pelo médico' : ''}
        </div>
        {r.status === 'validated' && (
          <div style={{ color: 'var(--text-2)' }}>
            {t.validated}: <strong>{r.validatedBy}</strong> · {formatDateTime(r.validatedAt)}
          </div>
        )}
        <div style={{ marginTop: 4 }}>{t.disclaimer}</div>
      </footer>
    </article>
  )
}

function ReportEditor({ r, onSave, onCancel }: { r: Report; onSave: (r: Report) => void; onCancel: () => void }) {
  const [d, setD] = useState<Report>(r)
  const lines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean)
  return (
    <div>
      <label className="field">
        <span>Informação clínica</span>
        <textarea className="textarea" value={d.clinicalIndication} onChange={(e) => setD({ ...d, clinicalIndication: e.target.value })} />
      </label>
      <label className="field">
        <span>Técnica</span>
        <textarea className="textarea" value={d.technique} onChange={(e) => setD({ ...d, technique: e.target.value })} />
      </label>
      {d.findingsByRegion.map((f, i) => (
        <label key={i} className="field">
          <span>Achados — {f.heading}</span>
          <textarea
            className="textarea"
            value={f.text}
            onChange={(e) => setD({ ...d, findingsByRegion: d.findingsByRegion.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
          />
        </label>
      ))}
      <label className="field">
        <span>Conclusão (uma por linha)</span>
        <textarea className="textarea" value={d.impression.join('\n')} onChange={(e) => setD({ ...d, impression: lines(e.target.value) })} />
      </label>
      <label className="field">
        <span>Recomendações (uma por linha)</span>
        <textarea className="textarea" value={d.recommendations.join('\n')} onChange={(e) => setD({ ...d, recommendations: lines(e.target.value) })} />
      </label>
      <label className="field">
        <span>Limitações</span>
        <textarea className="textarea" value={d.limitations} onChange={(e) => setD({ ...d, limitations: e.target.value })} />
      </label>
      <div className="row">
        <button className="btn btn-primary" onClick={() => onSave({ ...d, editedByClinician: true })}>
          <Check size={15} /> Guardar alterações
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function ValidateForm({ c, onDone }: { c: Case; onDone: () => void }) {
  const updateCase = useCases((s) => s.updateCase)
  const audit = useCases((s) => s.audit)
  const [name, setName] = useState('')
  const [ack, setAck] = useState(false)
  const pending = c.analysis?.findings.filter((f) => f.status === 'pending').length ?? 0
  return (
    <div className="card card-pad" style={{ marginTop: 'var(--sp-3)' }}>
      <h2 style={{ fontSize: 'var(--fs-md)' }}>Validação clínica</h2>
      {pending > 0 && (
        <div className="callout callout-warn" style={{ marginBottom: 12 }}>
          <ShieldAlert size={15} />
          <div>{pending} achado(s) da IA ainda por rever no separador Achados.</div>
        </div>
      )}
      <label className="field">
        <span>Nome do médico que valida</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome e número de cédula" autoComplete="name" />
      </label>
      <label className="row" style={{ gap: 8, alignItems: 'flex-start', marginBottom: 12, fontSize: 'var(--fs-sm)' }}>
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 3 }} />
        <span>Revi pessoalmente as imagens, os achados e o texto. Assumo a responsabilidade pela interpretação final.</span>
      </label>
      <div className="row">
        <button
          className="btn btn-primary"
          disabled={!ack || name.trim().length < 3 || pending > 0}
          onClick={() => {
            const at = nowIso()
            updateCase(c.id, (cc) => ({ status: 'validated', report: cc.report ? { ...cc.report, status: 'validated', validatedBy: name.trim(), validatedAt: at } : cc.report }))
            audit(c.id, { actor: 'user', action: 'Relatório validado', detail: name.trim() })
            onDone()
          }}
        >
          <BadgeCheck size={15} /> Validar relatório
        </button>
        <button className="btn btn-ghost" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

export function ReportPanel({ c }: { c: Case }) {
  const updateCase = useCases((s) => s.updateCase)
  const audit = useCases((s) => s.audit)
  const [mode, setMode] = useState<'view' | 'edit' | 'validate'>('view')
  const [copied, setCopied] = useState(false)
  const r = c.report

  if (!r) {
    return (
      <div className="empty">
        <FileText size={26} aria-hidden />
        <div>O relatório estruturado é gerado no fim da análise e fica como rascunho até ser validado por um médico.</div>
      </div>
    )
  }

  const evidence = c.analysis?.evidence ?? []

  return (
    <div>
      <div className="row no-print" style={{ marginBottom: 'var(--sp-3)', gap: 6 }}>
        {r.status !== 'validated' && mode === 'view' && (
          <>
            <button className="btn btn-sm" onClick={() => setMode('edit')}>
              <Pencil size={14} /> Editar
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => setMode('validate')}>
              <BadgeCheck size={14} /> Validar
            </button>
          </>
        )}
        <button
          className="btn btn-sm btn-ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(reportToText(c, r, evidence))
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado' : 'Copiar'}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => window.print()}>
          <Printer size={14} /> PDF
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => downloadJson(`${c.pseudoId}-DiagnosticReport.json`, toFhirDiagnosticReport(c, r, evidence))} title="Exportar FHIR R4 DiagnosticReport">
          <FileJson size={14} /> FHIR
        </button>
      </div>

      {mode === 'edit' ? (
        <ReportEditor
          r={r}
          onCancel={() => setMode('view')}
          onSave={(nr) => {
            updateCase(c.id, { report: nr })
            audit(c.id, { actor: 'user', action: 'Relatório editado' })
            setMode('view')
          }}
        />
      ) : (
        <div className="print-area">
          <ReportDocument c={c} r={r} />
        </div>
      )}
      {mode === 'validate' && <ValidateForm c={c} onDone={() => setMode('view')} />}
    </div>
  )
}
