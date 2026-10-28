import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  Activity,
  Check,
  ChevronDown,
  ChevronRight,
  FileWarning,
  Info,
  Lock,
  MapPinOff,
  Pencil,
  RotateCcw,
  ScanSearch,
  Sparkles,
  TriangleAlert,
  UserRound,
  X,
} from 'lucide-react'
import type { Case, Finding, Laterality } from '../../types'
import { useCases } from '../../store/cases'
import { isVlmConfigured, useSettings } from '../../store/settings'
import { href } from '../../lib/router'
import { REGION_LABEL } from '../../lib/labels'
import {
  AI_GENERATED,
  AI_HINT,
  APPROX_HINT,
  CLASS_LABEL,
  CONFIDENCE_HELP,
  CONFIDENCE_LEVEL,
  CONFIDENCE_WORD,
  GROUP_LABEL,
  LATERALITY_OPTIONS,
  LATERALITY_SHORT,
  PROVIDER_LABEL,
  REJECT_REASONS,
  REVIEW_LABEL,
  plural,
} from '../../lib/labels-findings'
import { formatDateTime } from '../../lib/util'
import { ClassChip, ClassGlyph } from '../viewer/ClassChip'
import { fmtClockShort } from '../viewer/format'
import { isLocked, orderedRange, reviewProgress, studyClass } from '../viewer/findingModel'
import { findingsStageDone, isTriageOnly } from '../../lib/report/state'
import { MODALITY_LABEL } from '../../lib/labels'
import { AnalyseButton, useAnalysisRun } from './PipelinePanel'
import { GlassProgress } from '../ui/glass'
import { BrowserModelNote } from '../settings/BrowserModelInfo'

export interface FindingActionRequest {
  id: string
  kind: 'reject' | 'edit'
  nonce: number
}

interface Props {
  c: Case
  codes: Map<string, string>
  selectedId?: string
  hoveredId?: string
  onSelect: (id: string) => void
  onHover: (id: string | undefined) => void
  actionRequest?: FindingActionRequest
  onOpenTab: (tab: 'evidence' | 'analysis' | 'report') => void
}

// ---------------------------------------------------------------------------

function ConfidenceMeter({ f }: { f: Finding }) {
  const [open, setOpen] = useState(false)
  const tipId = useId()
  const level = CONFIDENCE_LEVEL[f.confidence]
  return (
    <span className="fp-conf">
      <span className="fp-conf-label">Confiança</span>
      <span className={`fp-meter lvl-${level}`} aria-hidden>
        {[1, 2, 3].map((i) => (
          <i key={i} className={i <= level ? 'on' : undefined} />
        ))}
      </span>
      <span className="fp-conf-word">{CONFIDENCE_WORD[f.confidence]}</span>
      <span className="fp-tip-wrap">
        <button
          type="button"
          className="fp-info"
          aria-label="Sobre a confiança"
          aria-describedby={tipId}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation()
            setOpen((o) => !o)
          }}
          onBlur={() => setOpen(false)}
        >
          <Info size={13} aria-hidden />
        </button>
        <span id={tipId} role="tooltip" className={`fp-tip ${open ? 'is-open' : ''}`}>
          {CONFIDENCE_HELP}
        </span>
      </span>
    </span>
  )
}

function OriginBadge({ f }: { f: Finding }) {
  if (f.origin === 'clinician')
    return (
      <span className="fp-origin is-user" title="Achado adicionado pelo clínico">
        <UserRound size={11} aria-hidden /> Clínico
      </span>
    )
  return (
    <span className="fp-origin" title={AI_GENERATED}>
      <Sparkles size={11} aria-hidden /> IA
    </span>
  )
}

function locationText(c: Case, f: Finding): { where: string; approx: boolean; none: boolean } {
  const lat = LATERALITY_SHORT[f.laterality]
  const site = [f.anatomicSite, lat].filter(Boolean).join(' ')
  const loc = f.locations.find((l) => l.bbox) ?? f.locations[0]
  const si = loc ? c.series.findIndex((s) => s.id === loc.seriesId) : -1
  const s = si >= 0 ? c.series[si] : undefined
  const parts = [site]
  if (s) {
    if (s.kind === 'video' && f.frameRange) {
      const [a, b] = orderedRange(f.frameRange)
      const ta = s.frames[a]?.timeSec
      const tb = s.frames[b]?.timeSec
      parts.push(`Série ${si + 1}`)
      parts.push(`${ta !== undefined && tb !== undefined ? `${fmtClockShort(ta)}–${fmtClockShort(tb)} · ` : ''}fotogramas ${a + 1}–${b + 1}`)
    } else {
      parts.push(`Série ${si + 1}${s.view ? ` (${s.view})` : ''}`)
      parts.push(`Img ${(loc?.frameIndex ?? 0) + 1}`)
    }
  }
  return { where: parts.filter(Boolean).join(' · '), approx: !!loc?.bbox && f.origin === 'ai', none: !loc?.bbox }
}

// ---------------------------------------------------------------------------

function RejectForm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState<string>('')
  const [other, setOther] = useState('')
  const name = useId()
  const firstRef = useRef<HTMLInputElement>(null)
  useEffect(() => firstRef.current?.focus(), [])
  const valid = reason && (reason !== 'Outro' || other.trim().length > 1)
  return (
    <form
      className="fp-pop"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onConfirm(reason === 'Outro' ? `Outro: ${other.trim()}` : reason)
      }}
    >
      <fieldset>
        <legend>Motivo da rejeição</legend>
        {REJECT_REASONS.map((r, i) => (
          <label key={r} className="fp-radio">
            <input ref={i === 0 ? firstRef : undefined} type="radio" name={name} value={r} checked={reason === r} onChange={() => setReason(r)} />
            <span>{r === 'Outro' ? 'Outro (especificar)' : r}</span>
          </label>
        ))}
        {reason === 'Outro' && (
          <input className="input" value={other} onChange={(e) => setOther(e.target.value)} placeholder="Especifique o motivo" aria-label="Outro motivo" autoFocus />
        )}
      </fieldset>
      <div className="fp-pop-actions">
        <button type="submit" className="btn btn-sm" disabled={!valid}>
          <X size={14} aria-hidden /> Rejeitar
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function EditForm({ f, onCancel, onSave }: { f: Finding; onCancel: () => void; onSave: (p: { label: string; description: string; anatomicSite: string; laterality: Laterality }) => void }) {
  const [label, setLabel] = useState(f.label)
  const [description, setDescription] = useState(f.description)
  const [anatomicSite, setSite] = useState(f.anatomicSite)
  const [laterality, setLat] = useState<Laterality>(f.laterality)
  const id = useId()
  return (
    <form
      className="fp-pop fp-edit"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
      onSubmit={(e) => {
        e.preventDefault()
        if (label.trim()) onSave({ label: label.trim(), description: description.trim(), anatomicSite: anatomicSite.trim(), laterality })
      }}
    >
      <label className="field" htmlFor={`${id}-l`}>
        <span>Designação</span>
        <input id={`${id}-l`} className="input" value={label} onChange={(e) => setLabel(e.target.value)} required autoFocus />
      </label>
      <label className="field" htmlFor={`${id}-d`}>
        <span>Descrição</span>
        <textarea id={`${id}-d`} className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </label>
      <div className="fp-edit-row">
        <label className="field" htmlFor={`${id}-s`}>
          <span>Localização</span>
          <input id={`${id}-s`} className="input" value={anatomicSite} onChange={(e) => setSite(e.target.value)} />
        </label>
        <label className="field" htmlFor={`${id}-t`}>
          <span>Lateralidade</span>
          <select id={`${id}-t`} className="select" value={laterality} onChange={(e) => setLat(e.target.value as Laterality)}>
            {LATERALITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="fp-pop-actions">
        <button type="submit" className="btn btn-sm btn-primary" disabled={!label.trim()}>
          <Check size={14} aria-hidden /> Guardar alterações
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------

function FindingRow({
  c,
  f,
  code,
  selected,
  hovered,
  locked,
  generating,
  request,
  onSelect,
  onHover,
  onEvidence,
}: {
  c: Case
  f: Finding
  code: string
  selected: boolean
  hovered: boolean
  locked: boolean
  generating: boolean
  request?: FindingActionRequest
  onSelect: () => void
  onHover: (on: boolean) => void
  onEvidence: () => void
}) {
  const accept = useCases((s) => s.acceptFinding)
  const reject = useCases((s) => s.rejectFinding)
  const resetReview = useCases((s) => s.resetFindingReview)
  const edit = useCases((s) => s.editFinding)
  const [mode, setMode] = useState<'view' | 'reject' | 'edit'>('view')
  const ref = useRef<HTMLElement>(null)
  const loc = locationText(c, f)
  const confirmed = f.status === 'accepted' || f.status === 'edited'

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])

  useEffect(() => {
    if (request && request.id === f.id && !locked) setMode(request.kind)
  }, [request, f.id, locked])

  const statusText = f.status === 'pending' ? REVIEW_LABEL.pending : f.status === 'accepted' ? 'Confirmado por si' : f.status === 'edited' ? 'Editado por si' : REVIEW_LABEL.rejected

  return (
    <article
      ref={ref}
      className={`fp-row st-${f.status} ${selected ? 'is-sel' : ''} ${hovered ? 'is-hov' : ''}`}
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      aria-current={selected ? 'true' : undefined}
    >
      <div className="fp-row-head">
        <ClassGlyph cls={f.cls} size={13} />
        <button
          type="button"
          className="fp-row-title"
          onClick={(e) => {
            e.stopPropagation()
            onSelect()
          }}
          aria-label={`${code} ${f.label}, ${CLASS_LABEL[f.cls]}. Mostrar na imagem`}
        >
          <span className="fp-code mono">{code}</span>
          <span className="fp-label">{f.label}</span>
        </button>
        <span className="fp-row-tags">
          <OriginBadge f={f} />
          {generating && f.status === 'pending' && <span className="fp-gen">A gerar…</span>}
        </span>
      </div>
      <div className="fp-row-chips">
        <ClassChip cls={f.cls} small />
        {f.classification && (
          <span className="badge badge-neutral" title={f.classification.rationale}>
            {f.classification.system} {f.classification.grade}
          </span>
        )}
      </div>
      <div className="fp-row-meta">
        <span>{loc.where}</span>
        {loc.approx && (
          <span className="fp-approx" title={APPROX_HINT}>
            ≈ localização aprox.
          </span>
        )}
        {loc.none && (
          <span className="fp-approx" title="Achado sem localização na imagem">
            <MapPinOff size={12} aria-hidden /> Sem localização
          </span>
        )}
      </div>
      <ConfidenceMeter f={f} />
      {f.description && <p className={`fp-desc ${selected ? 'is-full' : ''}`}>«{f.description}»</p>}
      {f.evidenceIds.length > 0 && (
        <div className="fp-ev">
          <span>Evidência</span>
          {f.evidenceIds.map((id) => (
            <button
              key={id}
              type="button"
              className="fp-ev-chip mono"
              title="Ver evidência"
              onClick={(e) => {
                e.stopPropagation()
                onEvidence()
              }}
            >
              [{id}]
            </button>
          ))}
        </div>
      )}
      {f.status === 'rejected' && f.rejectReason && <p className="fp-reason">Motivo: «{f.rejectReason}»</p>}

      {mode === 'reject' && (
        <RejectForm
          onCancel={() => setMode('view')}
          onConfirm={(reason) => {
            reject(c.id, f.id, reason)
            setMode('view')
          }}
        />
      )}
      {mode === 'edit' && (
        <EditForm
          f={f}
          onCancel={() => setMode('view')}
          onSave={(patch) => {
            edit(c.id, f.id, patch)
            setMode('view')
          }}
        />
      )}

      {mode === 'view' && (
        <div className="fp-actions" onClick={(e) => e.stopPropagation()}>
          {!locked && (
            <>
              <button
                type="button"
                className={`btn btn-sm fp-act-accept ${confirmed ? 'is-on' : ''}`}
                aria-pressed={f.status === 'accepted'}
                title={f.status === 'accepted' ? 'Anular confirmação' : 'Aceitar (Enter)'}
                onClick={() => (f.status === 'accepted' ? resetReview(c.id, f.id) : accept(c.id, f.id))}
              >
                <Check size={14} aria-hidden /> {f.status === 'accepted' ? 'Aceite' : 'Aceitar'}
              </button>
              <button type="button" className="btn btn-sm" title="Editar (E)" onClick={() => setMode('edit')}>
                <Pencil size={13} aria-hidden /> Editar
              </button>
              <button type="button" className="btn btn-sm" title="Rejeitar (X)" onClick={() => setMode('reject')}>
                <X size={14} aria-hidden /> Rejeitar
              </button>
            </>
          )}
          <span className={`fp-status st-${f.status}`}>
            {confirmed && <Check size={12} aria-hidden />}
            {statusText}
          </span>
        </div>
      )}
    </article>
  )
}

/** Checklist items carry no model confidence (the checklist schema has none), so none is shown. */
function ChecklistRow({ f }: { f: Finding }) {
  return (
    <li className="fp-check">
      <ClassGlyph cls={f.cls} size={13} />
      <span className="fp-check-label">
        {f.label}
        <span className="sr-only"> · {CLASS_LABEL[f.cls].toLowerCase()}</span>
      </span>
    </li>
  )
}

function RejectedRow({ c, f, code, locked }: { c: Case; f: Finding; code: string; locked: boolean }) {
  const restore = useCases((s) => s.restoreFinding)
  return (
    <li className="fp-rej">
      <div>
        <span className="fp-code mono">{code}</span> <s>{f.label}</s>
        <div className="subtle">{f.rejectReason ? `«${f.rejectReason}»` : 'Rejeitado'}</div>
      </div>
      {!locked && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => restore(c.id, f.id)}>
          <RotateCcw size={13} aria-hidden /> Restaurar
        </button>
      )}
    </li>
  )
}

function Group({ title, count, defaultOpen = true, children, tone }: { title: string; count: number; defaultOpen?: boolean; children: ReactNode; tone?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section className={`fp-group ${tone ?? ''}`}>
      <h3>
        <button type="button" className="fp-group-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          {open ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
          <span>{title}</span>
          <span className="fp-count">{count}</span>
        </button>
      </h3>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

export function FindingsPanel({ c, codes, selectedId, hoveredId, onSelect, onHover, actionRequest, onOpenTab }: Props) {
  const a = c.analysis
  const { running, error } = useAnalysisRun(c)
  const configured = isVlmConfigured(useSettings())
  const locked = isLocked(c)
  // A failed run is not a result: never present it as «sem achados» or «não avaliável».
  const failed = c.status === 'error'
  const failMessage = error ?? a?.stages.find((s) => s.status === 'error')?.message

  if (a && !running && isTriageOnly(a) && a.triage) {
    const t = a.triage
    return (
      <div className="fp-empty">
        <ScanSearch size={26} aria-hidden className="fp-empty-ic" />
        <p>
          <strong>Só triagem.</strong> O modelo no navegador identificou: {MODALITY_LABEL[t.modality]} · {REGION_LABEL[t.region]}
          {t.view ? ` · ${t.view}` : ''} · qualidade {t.imageQuality === 'adequate' ? 'adequada' : t.imageQuality === 'limited' ? 'limitada' : 'não diagnóstica'}.
        </p>
        <p className="subtle fp-empty-hint">
          Este modelo é pequeno e não procura achados nem escreve relatório. Leia as imagens; para uma análise completa use Claude ou o MedGemma em{' '}
          <a href={href({ name: 'settings' })}>Definições → Modelo</a>.
        </p>
      </div>
    )
  }

  if (!a || (a.findings.length === 0 && (running || failed))) {
    return (
      <div className="fp-empty">
        {running ? (
          <>
            <p>A IA está a analisar este caso. Os achados aparecem aqui à medida que cada imagem é concluída.</p>
            <button type="button" className="btn" onClick={() => onOpenTab('analysis')}>
              <Activity size={16} aria-hidden /> Ver progresso da análise
            </button>
          </>
        ) : (
          <>
            <Sparkles size={26} aria-hidden className="fp-empty-ic" />
            <p>
              {failed
                ? 'A análise da IA falhou e não há resultado para este caso. Leia as imagens normalmente; pode tentar de novo depois de resolver o erro.'
                : 'Ainda não há análise de IA para este caso. Leia primeiro as imagens; a análise sugere achados para rever, nunca um diagnóstico.'}
            </p>
            {failMessage && (
              <div className="callout callout-error fp-empty-error" role="alert">
                <TriangleAlert size={16} aria-hidden />
                <div>
                  <strong>Erro.</strong> {failMessage}{' '}
                  <button type="button" className="fp-link" onClick={() => onOpenTab('analysis')}>
                    Ver detalhes
                  </button>
                </div>
              </div>
            )}
            <AnalyseButton c={c} />
            <BrowserModelNote />
            {!configured && (
              <p className="subtle fp-empty-hint">
                Para analisar, configure um modelo em <a href={href({ name: 'settings' })}>Definições → Modelo</a>.
              </p>
            )}
          </>
        )}
      </div>
    )
  }

  const findings = a.findings
  const active = findings.filter((f) => f.status !== 'rejected')
  const priority = active.filter((f) => f.group === 'priority')
  const other = active.filter((f) => f.group === 'other')
  const checklist = active.filter((f) => f.group === 'checklist')
  // «Indeterminate» checklist items were not assessed: never count or list them as «não detetados».
  const notDetected = checklist.filter((f) => f.cls === 'negative')
  const notAssessable = checklist.filter((f) => f.cls !== 'negative')
  const rejected = findings.filter((f) => f.status === 'rejected' && f.group !== 'checklist')
  const sc = studyClass(a)
  const { total, reviewed, pending } = reviewProgress(findings)
  const nPos = priority.filter((f) => f.cls === 'positive').length
  const nDub = priority.filter((f) => f.cls === 'doubtful').length
  const regionMismatch = a.triage && c.series[0] && a.triage.region !== 'other' && c.series[0].region !== 'other' && a.triage.region !== c.series[0].region
  const assessed = notDetected.map((f) => f.label.toLowerCase())
  const stale = !locked && !!c.report?.reportStale

  const row = (f: Finding) => (
    <FindingRow
      key={f.id}
      c={c}
      f={f}
      code={codes.get(f.id) ?? ''}
      selected={f.id === selectedId}
      hovered={f.id === hoveredId}
      locked={locked}
      generating={running}
      request={actionRequest}
      onSelect={() => onSelect(f.id)}
      onHover={(on) => onHover(on ? f.id : undefined)}
      onEvidence={() => onOpenTab('evidence')}
    />
  )

  return (
    <div className="fp">
      <section className="fp-summary" aria-labelledby="fp-summary-title">
        <h2 id="fp-summary-title" className="fp-summary-title" title={AI_HINT}>
          <Sparkles size={14} aria-hidden /> Resultado da IA — sugestão, verificar
          {running && <span className="fp-gen">A gerar…</span>}
        </h2>
        <div className="fp-summary-main">
          {failed && !findingsStageDone(a) ? (
            <span className="wsx-chip is-err">
              <X size={12} aria-hidden /> Análise incompleta
            </span>
          ) : (
            sc && <ClassChip cls={sc} ai />
          )}
          <span className="fp-summary-counts">
            {[
              nPos ? plural(nPos, 'positivo', 'positivos') : '',
              nDub ? plural(nDub, 'duvidoso', 'duvidosos') : '',
              other.length ? plural(other.length, 'outro', 'outros') : '',
              notDetected.length ? plural(notDetected.length, 'não detetado', 'não detetados') : '',
              notAssessable.length ? plural(notAssessable.length, 'não avaliável', 'não avaliáveis') : '',
            ]
              .filter(Boolean)
              .join(' · ') || 'sem achados'}
          </span>
        </div>
        {failed && (
          <p className="fp-caution">
            <TriangleAlert size={14} aria-hidden /> A análise da IA não terminou{failMessage ? `: ${failMessage}` : '.'} Os achados abaixo são parciais.
          </p>
        )}
        {sc === 'not-assessable' && !failed && (
          <p className="fp-caution">
            <TriangleAlert size={14} aria-hidden /> {a.triage?.qualityNotes || a.triage?.summary || 'O estudo não pôde ser avaliado pela IA.'}
          </p>
        )}
        {sc === 'negative' && (
          <p className="fp-negative">
            <strong>Sem achados prioritários.</strong>
            {assessed.length ? ` A IA avaliou e não detetou: ${assessed.join(', ')}.` : ''}
            {notAssessable.length ? ` ${plural(notAssessable.length, 'item não avaliável', 'itens não avaliáveis')} — ver lista abaixo.` : ''}
          </p>
        )}
        {c.indication && (
          <p className="fp-question">
            <span className="subtle">Pergunta clínica:</span> «{c.indication}»
          </p>
        )}
        {total > 0 && (
          <div className="fp-progress">
            <span>
              Revistos {reviewed}/{total}
            </span>
            <GlassProgress wrapperClassName="flex-1" className="h-2" value={reviewed} max={total} aria-label="Achados revistos" getValueLabel={(v, m) => `${v} de ${m}`} />
          </div>
        )}
        <p className="fp-summary-meta">
          {PROVIDER_LABEL[a.provider] ?? a.provider} · <span className="mono">{a.model}</span> · {formatDateTime(a.finishedAt ?? a.startedAt)}
          {a.precomputed ? ' · pré-calculada' : ''}
        </p>
      </section>

      {regionMismatch && (
        <div className="callout callout-warn" role="alert">
          <TriangleAlert size={16} aria-hidden />
          <div>
            <strong>Possível discordância de região anatómica.</strong> O pedido indica {REGION_LABEL[c.series[0].region].toLowerCase()}, mas a IA identificou{' '}
            {REGION_LABEL[a.triage!.region].toLowerCase()}. Verifique antes de aceitar achados.
          </div>
        </div>
      )}

      {locked ? (
        <p className="fp-locked">
          <Lock size={14} aria-hidden /> Relatório validado — os achados estão bloqueados.
        </p>
      ) : (
        pending.length > 0 && (
          <div className="fp-pending" role="status">
            <TriangleAlert size={16} aria-hidden />
            <div>
              <strong>{plural(pending.length, 'achado por rever', 'achados por rever')}.</strong> Aceite, edite ou rejeite cada achado antes de validar.
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                const idx = pending.findIndex((f) => f.id === selectedId)
                onSelect(pending[(idx + 1) % pending.length].id)
              }}
            >
              Rever seguinte
            </button>
          </div>
        )
      )}

      {stale && (
        <div className="callout callout-warn fp-stale" role="status">
          <FileWarning size={16} aria-hidden />
          <div>
            <strong>O relatório foi gerado antes desta decisão.</strong> Reveja «Achados» e «Conclusão» no relatório.{' '}
            <button type="button" className="fp-link" onClick={() => onOpenTab('report')}>
              Abrir relatório
            </button>
          </div>
        </div>
      )}

      <Group title={GROUP_LABEL.priority} count={priority.length}>
        {priority.length ? priority.map(row) : <p className="fp-none">Sem achados prioritários.</p>}
      </Group>
      {other.length > 0 && (
        <Group title={GROUP_LABEL.other} count={other.length}>
          {other.map(row)}
        </Group>
      )}
      {notAssessable.length > 0 && (
        <Group title={GROUP_LABEL.notAssessable} count={notAssessable.length} defaultOpen={false}>
          <ul className="fp-checklist">
            {notAssessable.map((f) => (
              <ChecklistRow key={f.id} f={f} />
            ))}
          </ul>
        </Group>
      )}
      {notDetected.length > 0 && (
        <Group title={GROUP_LABEL.checklist} count={notDetected.length} defaultOpen={false}>
          <ul className="fp-checklist">
            {notDetected.map((f) => (
              <ChecklistRow key={f.id} f={f} />
            ))}
          </ul>
        </Group>
      )}
      {rejected.length > 0 && (
        <Group title={GROUP_LABEL.rejected} count={rejected.length} defaultOpen={false} tone="is-rejected">
          <ul className="fp-checklist">
            {rejected.map((f) => (
              <RejectedRow key={f.id} c={c} f={f} code={codes.get(f.id) ?? ''} locked={locked} />
            ))}
          </ul>
        </Group>
      )}
      <p className="fp-foot subtle">
        <Info size={12} aria-hidden /> Localizações aproximadas e confiança declarada pelo modelo, não calibrada. O rascunho do relatório foi gerado
        antes da sua revisão: confirme que o texto não inclui achados rejeitados.
      </p>
    </div>
  )
}
