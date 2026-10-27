import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BadgeCheck, BookMarked, Check, FileText, Library, Lock, Notebook, Pencil, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import type { Case, Report } from '../../types'
import { useCases } from '../../store/cases'
import { aiDeclarationFor, citationNumbers, citedEvidence, reportStrings, studyLine } from '../../lib/report/format'
import { shortHash } from '../../lib/report/hash'
import { evidenceVerification, pendingFindings, reportState } from '../../lib/report/state'
import { DEFAULT_COMPARISON, REPORT_SECTIONS, type ReportSectionKey } from '../../lib/labels-report'
import { formatDate, formatDateTime } from '../../lib/util'
import { AiTag, ReportStateChip, ReviewedTag } from './StatusChips'
import { Cited } from './Cited'
import { ExportMenu } from './ExportMenu'
import { ValidationDialog } from './ValidationDialog'
import { ReportPrint } from './ReportPrint'
import '../../styles/report.css'

const SCOPE = 'rpt'

type Draft = { text: string; items: { heading: string; text: string }[] }

function lines(v: string): string[] {
  return v
    .split('\n')
    .map((x) => x.replace(/^\s*(\d+[.)]|[-•])\s*/, '').trim())
    .filter(Boolean)
}

function sectionText(r: Report, k: ReportSectionKey): string {
  switch (k) {
    case 'indication':
      return r.clinicalIndication
    case 'technique':
      return r.technique
    case 'comparison':
      return r.comparison
    case 'impression':
      return r.impression.join('\n')
    case 'recommendations':
      return r.recommendations.join('\n')
    case 'limitations':
      return r.limitations
    default:
      return ''
  }
}

function applyDraft(r: Report, k: ReportSectionKey, d: Draft): Partial<Report> {
  switch (k) {
    case 'indication':
      return { clinicalIndication: d.text.trim() }
    case 'technique':
      return { technique: d.text.trim() }
    case 'comparison':
      return { comparison: d.text.trim() }
    case 'findings':
      return { findingsByRegion: d.items.map((x) => ({ heading: x.heading.trim() || 'Achados', text: x.text.trim() })).filter((x) => x.text) }
    case 'impression':
      return { impression: lines(d.text) }
    case 'recommendations':
      return { recommendations: lines(d.text) }
    case 'limitations':
      return { limitations: d.text.trim() }
    default:
      return { findingsByRegion: r.findingsByRegion }
  }
}

function SectionCard({
  title,
  reviewed,
  locked,
  editing,
  onEdit,
  onAccept,
  children,
  id,
  aux,
}: {
  title: string
  reviewed: boolean
  locked: boolean
  editing: boolean
  onEdit: () => void
  onAccept: () => void
  children: ReactNode
  id: string
  aux?: ReactNode
}) {
  return (
    <section className={`rp-sec ${reviewed || locked ? 'rp-sec-reviewed' : 'rp-sec-ai'} ${editing ? 'rp-sec-editing' : ''}`} aria-labelledby={id}>
      <header className="rp-sec-head">
        <h3 id={id}>{title}</h3>
        {reviewed ? <ReviewedTag /> : <AiTag />}
        {aux}
        {!locked && !editing && (
          <span className="rp-sec-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit} aria-label={`Editar ${title}`}>
              <Pencil size={13} /> <span className="rp-hide-xs">Editar</span>
            </button>
            {!reviewed && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onAccept} aria-label={`Aceitar secção ${title}`}>
                <Check size={13} /> <span className="rp-hide-xs">Aceitar</span>
              </button>
            )}
          </span>
        )}
      </header>
      <div className="rp-sec-body">{children}</div>
    </section>
  )
}

export function ReportPanel({ c }: { c: Case }) {
  const updateCase = useCases((s) => s.updateCase)
  const audit = useCases((s) => s.audit)
  const r = c.report
  const [editing, setEditing] = useState<ReportSectionKey | null>(null)
  const [draft, setDraft] = useState<Draft>({ text: '', items: [] })
  const [validateOpen, setValidateOpen] = useState(false)
  const [status, setStatus] = useState('')
  const statusTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(statusTimer.current), [])

  const evidence = useMemo(() => c.analysis?.evidence ?? [], [c.analysis])
  const numbers = useMemo(() => (r ? citationNumbers(r, evidence) : new Map<string, number>()), [r, evidence])

  if (!r) {
    return (
      <div className="empty">
        <FileText size={26} aria-hidden />
        <div>O relatório estruturado é gerado no fim da análise e fica como rascunho da IA até ser validado por um médico.</div>
      </div>
    )
  }

  const t = reportStrings(r)
  const locked = r.status === 'validated'
  const state = reportState(r)
  const pending = pendingFindings(c).length
  const reviewed = new Set(r.reviewedSections ?? [])
  const refs = citedEvidence(r, evidence)
  const issues = (c.analysis?.verification?.issues ?? []).filter((i) => i.severity !== 'info')
  const findings = c.analysis?.findings ?? []
  const findingLabel = (code: string) => findings[Number(code.slice(1)) - 1]?.label

  const flash = (msg: string) => {
    setStatus(msg)
    window.clearTimeout(statusTimer.current)
    statusTimer.current = window.setTimeout(() => setStatus(''), 3500)
  }

  const markReviewed = (k: ReportSectionKey, patch: Partial<Report>, edited: boolean) => {
    const label = REPORT_SECTIONS.find((s) => s.key === k)?.pt ?? k
    updateCase(c.id, (cc) => {
      if (!cc.report || cc.report.status === 'validated') return {}
      const set = new Set(cc.report.reviewedSections ?? [])
      set.add(k)
      return { report: { ...cc.report, ...patch, editedByClinician: cc.report.editedByClinician || edited, reviewedSections: [...set] } }
    })
    audit(c.id, { actor: 'user', action: edited ? 'Relatório editado' : 'Secção do relatório aceite', detail: label })
  }

  const startEdit = (k: ReportSectionKey) => {
    setEditing(k)
    setDraft({ text: sectionText(r, k), items: r.findingsByRegion.map((x) => ({ ...x })) })
  }

  const title = (k: ReportSectionKey) => {
    const s = REPORT_SECTIONS.find((x) => x.key === k)!
    return r.language === 'en' ? s.en : s.pt
  }

  const cited = (text: string) => <Cited text={text} numbers={numbers} evidence={evidence} scope={SCOPE} findingLabel={findingLabel} />

  const editor = (k: ReportSectionKey) => {
    const multi = k === 'impression' || k === 'recommendations'
    const nImpr = k === 'impression' ? lines(draft.text).length : 0
    return (
      <div className="rp-editor">
        {k === 'findings' ? (
          draft.items.map((it, i) => (
            <div key={i} className="rp-editor-pair">
              <input
                className="input"
                value={it.heading}
                aria-label={`Título do grupo ${i + 1}`}
                onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)) })}
              />
              <textarea
                className="textarea"
                value={it.text}
                aria-label={`Texto de ${it.heading || `grupo ${i + 1}`}`}
                onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
              />
            </div>
          ))
        ) : (
          <textarea
            className="textarea"
            value={draft.text}
            rows={multi ? 5 : 3}
            aria-label={title(k)}
            placeholder={k === 'comparison' ? DEFAULT_COMPARISON : undefined}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            autoFocus
          />
        )}
        <div className="rp-editor-help">
          {multi && 'Um item por linha. '}
          {k === 'impression' && (nImpr > 5 ? <strong className="rp-warn-text">Máximo recomendado: 5 itens (tem {nImpr}). </strong> : 'No máximo 5 itens, o mais importante primeiro. ')}
          Mantenha os marcadores de citação como <code>[id]</code>.
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => {
              markReviewed(k, applyDraft(r, k, draft), true)
              setEditing(null)
              flash(`Secção «${title(k)}» guardada.`)
            }}
          >
            <Check size={14} /> Guardar
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>
            <X size={14} /> Cancelar
          </button>
        </div>
      </div>
    )
  }

  const card = (k: ReportSectionKey, body: ReactNode, aux?: ReactNode) => (
    <SectionCard
      key={k}
      id={`${SCOPE}-sec-${k}`}
      title={title(k)}
      reviewed={reviewed.has(k) || locked}
      locked={locked}
      editing={editing === k}
      onEdit={() => startEdit(k)}
      onAccept={() => {
        markReviewed(k, {}, false)
        flash(`Secção «${title(k)}» aceite.`)
      }}
      aux={aux}
    >
      {editing === k ? editor(k) : body}
    </SectionCard>
  )

  const sexAge = [c.sex === 'F' ? 'F' : c.sex === 'M' ? 'M' : c.sex === 'X' ? 'Não indicado' : '', c.ageYears ? `${c.ageYears} anos` : ''].filter(Boolean).join(' · ')

  return (
    <div className="rp-report">
      <div className="rp-report-bar">
        <div className="rp-report-state">
          <ReportStateChip state={state} />
          {!locked && pending > 0 && (
            <span className="rp-pending">
              <TriangleAlert size={13} aria-hidden /> {pending} por rever
            </span>
          )}
        </div>
        <div className="rp-report-actions">
          <ExportMenu c={c} r={r} onStatus={flash} />
          {!locked && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setValidateOpen(true)}>
              <BadgeCheck size={14} /> Validar…
            </button>
          )}
        </div>
      </div>
      <div className={`rp-status ${status ? 'show' : ''}`} role="status" aria-live="polite">
        {status}
      </div>

      {locked ? (
        <div className="callout callout-info">
          <Lock size={16} />
          <div>Relatório validado e bloqueado. Para alterar, crie um novo caso ou exporte e edite fora da plataforma.</div>
        </div>
      ) : pending > 0 ? (
        <div className="callout callout-warn">
          <TriangleAlert size={16} />
          <div>
            <strong>
              Existem {pending} {pending === 1 ? 'achado' : 'achados'} por rever.
            </strong>{' '}
            Aceite, edite ou rejeite cada achado antes de validar.
          </div>
        </div>
      ) : null}
      {issues.length > 0 && !locked && (
        <div className="callout callout-warn">
          <ShieldCheck size={16} />
          <div>
            <strong>Verificações automáticas de segurança</strong>
            <ul className="rp-issues">
              {issues.map((i, n) => (
                <li key={n}>
                  <span className="rp-issue-sec">{i.section}:</span> {i.message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <header className="rp-doc-head">
        <h2>{t.title}</h2>
        <div className="rp-doc-meta">
          <span className="mono">{c.pseudoId}</span>
          {sexAge && <span>{sexAge}</span>}
          <span>{studyLine(c, r.language)}</span>
          <span>
            {t.studyDate}: {formatDate(c.createdAt)}
          </span>
        </div>
      </header>

      {card('indication', <p>{r.clinicalIndication ? cited(r.clinicalIndication) : <span className="subtle">—</span>}</p>)}
      {card('technique', <p>{cited(r.technique || '—')}</p>)}
      {card('comparison', <p>{cited(r.comparison || DEFAULT_COMPARISON)}</p>)}
      {card(
        'findings',
        r.findingsByRegion.length ? (
          <dl className="rp-findings">
            {r.findingsByRegion.map((f, i) => (
              <div key={i}>
                <dt>{f.heading}</dt>
                <dd>{cited(f.text)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="subtle">Sem achados descritos.</p>
        ),
      )}
      {card(
        'impression',
        <ol className="rp-conclusion">
          {r.impression.map((x, i) => (
            <li key={i}>{cited(x)}</li>
          ))}
        </ol>,
      )}
      {(r.recommendations.length > 0 || !locked) &&
        card(
          'recommendations',
          r.recommendations.length ? (
            <ul className="rp-list">
              {r.recommendations.map((x, i) => (
                <li key={i}>{cited(x)}</li>
              ))}
            </ul>
          ) : (
            <p className="subtle">Sem recomendações.</p>
          ),
        )}
      {(r.limitations || !locked) && card('limitations', <p className="muted">{r.limitations ? cited(r.limitations) : '—'}</p>)}

      <section className="rp-sec rp-sec-auto" aria-labelledby={`${SCOPE}-refs`}>
        <header className="rp-sec-head">
          <h3 id={`${SCOPE}-refs`}>{t.references}</h3>
          <span className="rp-auto-tag">
            {refs.filter((e) => evidenceVerification(e).kind !== 'unverified').length}/{refs.length} verificadas
          </span>
        </header>
        <div className="rp-sec-body">
          {refs.length === 0 ? (
            <p className="subtle">O texto não cita referências.</p>
          ) : (
            <ol className="rp-refs">
              {refs.map((e) => {
                const v = evidenceVerification(e)
                return (
                  <li key={e.id} id={`${SCOPE}-ref-${e.id}`}>
                    <span className="rp-ref-n">[{numbers.get(e.id)}]</span>
                    <span>
                      {e.citation}
                      {e.doi && (
                        <>
                          {' '}
                          <a href={`https://doi.org/${e.doi}`} target="_blank" rel="noreferrer">
                            doi:{e.doi}
                          </a>
                        </>
                      )}
                      <span className="rp-ref-badges">
                        <span className={`rp-src-badge ${e.source === 'notebooklm' ? 'nlm' : 'kb'}`}>
                          {e.source === 'notebooklm' ? <Notebook size={11} aria-hidden /> : <Library size={11} aria-hidden />}
                          {e.source === 'notebooklm' ? 'NotebookLM' : 'Base curada'}
                        </span>
                        {v.kind === 'unverified' && (
                          <span className="rp-verify unverified">
                            <TriangleAlert size={11} aria-hidden /> Não verificada
                          </span>
                        )}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </section>

      <section className="rp-sec rp-sec-auto" aria-labelledby={`${SCOPE}-decl`}>
        <header className="rp-sec-head">
          <h3 id={`${SCOPE}-decl`}>{t.aiDeclaration}</h3>
          <span className="rp-auto-tag">
            <Lock size={11} aria-hidden /> automática
          </span>
        </header>
        <div className="rp-sec-body">
          <p className="rp-decl">{aiDeclarationFor(c, r)}</p>
        </div>
      </section>

      <section className={`rp-sec rp-sec-auto ${locked ? 'rp-sec-valid' : ''}`} aria-labelledby={`${SCOPE}-val`}>
        <header className="rp-sec-head">
          <h3 id={`${SCOPE}-val`}>{t.validation}</h3>
          <ReportStateChip state={state} />
        </header>
        <div className="rp-sec-body">
          {locked ? (
            <>
              <p>
                Validado por <strong>{r.validatedBy}</strong>
                {r.validatorLicence ? ` (cédula ${r.validatorLicence})` : ''} em {formatDateTime(r.validatedAt)}
              </p>
              {r.contentHash && (
                <p className="rp-hash">
                  SHA-256{' '}
                  <span className="mono" title={r.contentHash}>
                    {shortHash(r.contentHash)}
                  </span>
                  <span className="mono rp-hash-full">{r.contentHash}</span>
                </p>
              )}
              <p className="subtle">{t.localValidation}</p>
            </>
          ) : (
            <p className="subtle">
              Ainda não validado. A validação exige todos os achados revistos e a conclusão revista, e calcula um hash SHA-256 do conteúdo.
            </p>
          )}
        </div>
      </section>

      <p className="rp-foot">
        <BookMarked size={12} aria-hidden /> {t.generated}: {r.generatedBy} · {formatDateTime(r.generatedAt)}
        {r.editedByClinician ? ' · editado pelo médico' : ''}
      </p>

      <ValidationDialog c={c} r={r} open={validateOpen} onClose={() => setValidateOpen(false)} onDone={flash} />
      <ReportPrint c={c} r={r} />
    </div>
  )
}
