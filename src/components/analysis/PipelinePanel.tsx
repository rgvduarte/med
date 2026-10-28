import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import {
  Ban,
  CircleCheckBig,
  CircleDashed,
  CircleX,
  Info,
  KeyRound,
  LoaderCircle,
  Minus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react'
import type { Case, StageId, StageState } from '../../types'
import { useCases } from '../../store/cases'
import { isVlmConfigured, useSettings } from '../../store/settings'
import { runAnalysis } from '../../lib/vlm/run'
import { PIXEL_CONFIRM_ACTION, needsPixelConfirmation, pixelPrivacy } from '../../lib/report/state'
import { href } from '../../lib/router'
import { LATERALITY_LABEL, MODALITY_LABEL, REGION_LABEL } from '../../lib/labels'
import { PIPELINE_ORDER, PIPELINE_STEP, PROVIDER_LABEL, STAGE_STATUS_LABEL, plural } from '../../lib/labels-findings'
import { errorMessage, formatDateTime, formatDuration, nowIso } from '../../lib/util'

// ---------------------------------------------------------------------------
// Run controller: one handle per case, kept outside React so a run survives tab
// switches and navigation (the runner itself writes progress into the cases store).

interface RunHandle {
  cancel: () => void
  done: Promise<void>
}

interface RunsState {
  handles: Record<string, RunHandle | undefined>
  errors: Record<string, string | undefined>
  cancelled: Record<string, boolean | undefined>
}

const useRuns = create<RunsState>(() => ({ handles: {}, errors: {}, cancelled: {} }))

function patchRuns(caseId: string, patch: { handle?: RunHandle | null; error?: string | null; cancelled?: boolean }) {
  useRuns.setState((s) => ({
    handles: 'handle' in patch ? { ...s.handles, [caseId]: patch.handle ?? undefined } : s.handles,
    errors: 'error' in patch ? { ...s.errors, [caseId]: patch.error ?? undefined } : s.errors,
    cancelled: 'cancelled' in patch ? { ...s.cancelled, [caseId]: patch.cancelled } : s.cancelled,
  }))
}

/** Leaves the case in a consistent state if the runner settled without updating it. */
function settle(caseId: string, failed: boolean) {
  const store = useCases.getState()
  const c = store.cases.find((x) => x.id === caseId)
  if (!c || c.status !== 'analysing') return
  const hasFindings = (c.analysis?.findings.length ?? 0) > 0
  store.updateCase(caseId, (cur) => ({
    status: failed ? (hasFindings ? 'analysed' : 'error') : hasFindings ? 'analysed' : 'new',
    analysis: cur.analysis
      ? {
          ...cur.analysis,
          stages: cur.analysis.stages.map((st) =>
            st.status === 'running' ? { ...st, status: failed ? 'error' : 'skipped', finishedAt: nowIso(), message: failed ? st.message : 'Cancelada pelo utilizador' } : st,
          ),
        }
      : cur.analysis,
  }))
}

// Case waiting for the «no identifying text in the pixels» confirmation before images go to a non-local provider.
const usePixelGate = create<{ caseId?: string }>(() => ({}))

export function startAnalysis(caseId: string) {
  if (useRuns.getState().handles[caseId]) return
  const c = useCases.getState().cases.find((x) => x.id === caseId)
  if (c && needsPixelConfirmation(c, useSettings.getState().provider)) {
    usePixelGate.setState({ caseId })
    return
  }
  useCases.getState().audit(caseId, { actor: 'user', action: 'Análise pedida' })
  patchRuns(caseId, { error: null, cancelled: false })
  let h: RunHandle
  try {
    h = runAnalysis(caseId)
  } catch (e) {
    patchRuns(caseId, { error: errorMessage(e) })
    return
  }
  patchRuns(caseId, { handle: h })
  h.done
    .then(
      () => settle(caseId, false),
      (e: unknown) => {
        const wasCancelled = !!useRuns.getState().cancelled[caseId]
        if (!wasCancelled) {
          patchRuns(caseId, { error: errorMessage(e) })
          useCases.getState().audit(caseId, { actor: 'system', action: 'Análise falhou', detail: errorMessage(e) })
        }
        settle(caseId, !wasCancelled)
      },
    )
    .finally(() => patchRuns(caseId, { handle: null }))
}

export function cancelAnalysis(caseId: string) {
  const h = useRuns.getState().handles[caseId]
  patchRuns(caseId, { cancelled: true, error: null })
  useCases.getState().audit(caseId, { actor: 'user', action: 'Análise cancelada' })
  if (h) h.cancel()
  else settle(caseId, false)
}

const PIXEL_CONFIRM_TEXT = 'Confirmo que as imagens não contêm dados identificativos (nomes, datas, números) gravados nos píxeis.'

/**
 * Asked once per case (recorded in the audit trail) before images are sent to an external provider,
 * unless every series is DICOM declaring BurnedInAnnotation = NO. Mount once in the case workspace.
 */
export function PixelConfirmDialog({ c }: { c: Case }) {
  const open = usePixelGate((s) => s.caseId === c.id)
  const ref = useRef<HTMLDialogElement>(null)
  const [checked, setChecked] = useState(false)
  const burnedIn = pixelPrivacy(c).burnedIn

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    else if (!open && d.open) d.close()
  }, [open])

  const close = () => {
    setChecked(false)
    usePixelGate.setState({ caseId: undefined })
  }
  const confirm = () => {
    if (!checked) return
    const kinds = [...new Set(c.series.map((s) => (s.kind === 'dicom' ? `DICOM (BurnedInAnnotation ${s.burnedInAnnotation ?? 'não declarado'})` : s.kind === 'video' ? 'vídeo' : 'imagem')))]
    useCases.getState().audit(c.id, {
      actor: 'user',
      action: PIXEL_CONFIRM_ACTION,
      detail: `«${PIXEL_CONFIRM_TEXT}» Antes do envio para ${PROVIDER_LABEL.anthropic}; ${plural(c.series.length, 'série', 'séries')}: ${kinds.join(', ')}.`,
    })
    close()
    startAnalysis(c.id)
  }

  return (
    <dialog ref={ref} className="rp-dialog pp-pixel" aria-labelledby="pp-pixel-title" onClose={close} onCancel={close}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          confirm()
        }}
      >
        <header className="rp-dialog-head">
          <h2 id="pp-pixel-title">
            <ShieldAlert size={18} aria-hidden /> Antes de enviar as imagens
          </h2>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Fechar" onClick={close}>
            <X size={18} />
          </button>
        </header>
        <div className="rp-dialog-body">
          <p className="rp-dialog-note">
            A análise envia as imagens ao fornecedor externo configurado ({PROVIDER_LABEL.anthropic}). A anonimização remove as etiquetas DICOM, mas
            não apaga texto gravado nos próprios píxeis — e as imagens PNG/JPEG e os vídeos não têm metadados que o excluam.
          </p>
          {burnedIn && (
            <div className="callout callout-warn" role="alert">
              <TriangleAlert size={16} aria-hidden />
              <div>Pelo menos uma série DICOM declara anotações gravadas na imagem (BurnedInAnnotation = YES).</div>
            </div>
          )}
          <label className="rp-checkbox rp-checkbox-strong">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>{PIXEL_CONFIRM_TEXT}</span>
          </label>
          <p className="rp-dialog-note">A confirmação fica no registo do caso e só é pedida uma vez.</p>
        </div>
        <footer className="rp-dialog-foot">
          <button type="button" className="btn btn-ghost" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={!checked}>
            <Sparkles size={15} aria-hidden /> Enviar para análise
          </button>
        </footer>
      </form>
    </dialog>
  )
}

export function useAnalysisRun(c: Case | undefined) {
  const handle = useRuns((s) => (c ? s.handles[c.id] : undefined))
  const error = useRuns((s) => (c ? s.errors[c.id] : undefined))
  const cancelled = useRuns((s) => (c ? !!s.cancelled[c.id] : false))
  const running = !!handle || c?.status === 'analysing'
  return { running, error, cancelled }
}

/** Fraction of pipeline stages finished (0..1), for the 2px progress line. */
export function pipelineProgress(c: Case): number {
  const st = c.analysis?.stages ?? []
  if (!st.length) return 0
  return st.filter((s) => s.status === 'done' || s.status === 'skipped' || s.status === 'error').length / st.length
}

// ---------------------------------------------------------------------------

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

function StepIcon({ status }: { status: StageState['status'] }) {
  const p = { size: 18, strokeWidth: 1.9, 'aria-hidden': true }
  if (status === 'running') return <LoaderCircle {...p} className="spin pp-ic is-run" />
  if (status === 'done') return <CircleCheckBig {...p} className="pp-ic is-done" />
  if (status === 'error') return <CircleX {...p} className="pp-ic is-err" />
  if (status === 'skipped') return <Minus {...p} className="pp-ic is-skip" />
  return <CircleDashed {...p} className="pp-ic is-pend" />
}

function stageMs(s: StageState, now: number): number | undefined {
  if (!s.startedAt) return undefined
  const end = s.finishedAt ? new Date(s.finishedAt).getTime() : s.status === 'running' ? now : undefined
  return end === undefined ? undefined : Math.max(0, end - new Date(s.startedAt).getTime())
}

export function AnalyseButton({ c, label = 'Analisar com IA', className = 'btn btn-primary' }: { c: Case; label?: string; className?: string }) {
  const settings = useSettings()
  const configured = isVlmConfigured(settings)
  const { running } = useAnalysisRun(c)
  return (
    <button
      type="button"
      className={className}
      onClick={() => startAnalysis(c.id)}
      disabled={!configured || running || c.status === 'validated'}
      title={configured ? undefined : 'Configure um modelo em Definições → Modelo'}
    >
      {running ? <LoaderCircle size={16} className="spin" aria-hidden /> : <Sparkles size={16} aria-hidden />}
      {running ? 'A analisar…' : label}
    </button>
  )
}

export function PipelinePanel({ c }: { c: Case }) {
  const settings = useSettings()
  const configured = isVlmConfigured(settings)
  const { running, error, cancelled } = useAnalysisRun(c)
  const [confirmRerun, setConfirmRerun] = useState(false)
  const a = c.analysis
  const now = useNow(running)

  const stages: StageState[] = useMemo(() => {
    const byId = new Map((a?.stages ?? []).map((s) => [s.id, s]))
    const ordered: StageState[] = PIPELINE_ORDER.map((id) => byId.get(id) ?? { id, status: 'pending' })
    for (const s of a?.stages ?? []) if (!PIPELINE_ORDER.includes(s.id)) ordered.push(s)
    return ordered
  }, [a?.stages])

  // Polite announcement of stage transitions for screen readers.
  const [announce, setAnnounce] = useState('')
  const prev = useRef<Record<string, string>>({})
  useEffect(() => {
    const changes: string[] = []
    for (const s of stages) {
      if (prev.current[s.id] && prev.current[s.id] !== s.status) changes.push(`${PIPELINE_STEP[s.id as StageId]?.label ?? s.id}: ${STAGE_STATUS_LABEL[s.status].toLowerCase()}`)
      prev.current[s.id] = s.status
    }
    if (changes.length) setAnnounce(changes.join('. '))
  }, [stages])

  const finished = !running && !!a?.finishedAt && c.status === 'analysed'
  const totalMs = a?.finishedAt ? new Date(a.finishedAt).getTime() - new Date(a.startedAt).getTime() : undefined
  const reviewable = a?.findings.filter((f) => f.group !== 'checklist') ?? []
  const nPos = reviewable.filter((f) => f.cls === 'positive').length
  const nDub = reviewable.filter((f) => f.cls === 'doubtful').length
  const nRefs = a?.evidence.filter((e) => e.source === 'kb').length ?? 0
  const usage = a?.totalUsage ?? stages.reduce(
    (acc, s) => (s.usage ? { inputTokens: acc.inputTokens + s.usage.inputTokens, outputTokens: acc.outputTokens + s.usage.outputTokens } : acc),
    { inputTokens: 0, outputTokens: 0 } as { inputTokens: number; outputTokens: number; cacheReadTokens?: number },
  )
  const locked = c.status === 'validated'

  return (
    <div className="pp">
      <div className="pp-head">
        <h2>Análise</h2>
        {running ? (
          <button type="button" className="btn btn-sm" onClick={() => cancelAnalysis(c.id)}>
            <Ban size={14} aria-hidden /> Cancelar análise
          </button>
        ) : a && !locked ? (
          <button type="button" className="btn btn-sm" onClick={() => setConfirmRerun(true)} disabled={!configured} title={configured ? undefined : 'Configure um modelo em Definições → Modelo'}>
            <RotateCcw size={14} aria-hidden /> Analisar novamente
          </button>
        ) : null}
      </div>

      {confirmRerun && !running && (
        <div className="callout callout-warn pp-confirm" role="alertdialog" aria-labelledby="pp-rerun">
          <TriangleAlert size={16} aria-hidden />
          <div>
            <p id="pp-rerun" style={{ margin: 0 }}>
              Isto substitui os achados atuais, as suas revisões e o rascunho do relatório. Continuar?
            </p>
            <div className="row" style={{ gap: 6, marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => {
                  setConfirmRerun(false)
                  startAnalysis(c.id)
                }}
              >
                Analisar novamente
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmRerun(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {!a && !running && (
        <div className="pp-intro">
          <p className="muted">
            O modelo de linguagem visual analisa as imagens e os fotogramas-chave em seis etapas. O visualizador continua disponível durante a análise e
            cada etapa produz dados estruturados que pode rever.
          </p>
          <AnalyseButton c={c} />
        </div>
      )}

      {!configured && !running && !locked && (
        <div className="callout callout-warn">
          <KeyRound size={16} aria-hidden />
          <div>
            Nenhum modelo configurado. <a href={href({ name: 'settings' })}>Configure um modelo em Definições → Modelo</a> (chave da API Anthropic ou
            servidor local compatível). O visualizador e o relatório manual continuam disponíveis.
          </div>
        </div>
      )}

      {a?.precomputed && (
        <div className="callout callout-info">
          <Info size={16} aria-hidden />
          <div>
            Análise de demonstração <strong>pré-calculada</strong> com o mesmo protocolo ({a.model}).
          </div>
        </div>
      )}

      {error && !running && (
        <div className="callout callout-warn" role="alert">
          <CircleX size={16} aria-hidden />
          <div>
            <strong>Erro.</strong> {error}
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-sm" onClick={() => startAnalysis(c.id)} disabled={!configured}>
                <RotateCcw size={14} aria-hidden /> Tentar novamente
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelled && !running && !error && (
        <p className="pp-note" role="status">
          Análise cancelada. Os resultados parciais, se existirem, mantêm-se visíveis.
        </p>
      )}

      {finished && (
        <p className="pp-summary" role="status">
          <CircleCheckBig size={16} aria-hidden className="pp-ic is-done" />
          <span>
            Análise concluída{totalMs !== undefined ? ` em ${formatDuration(totalMs)}` : ''} · {plural(reviewable.length, 'achado', 'achados')}
            {reviewable.length ? ` (${[nPos ? plural(nPos, 'positivo', 'positivos') : '', nDub ? plural(nDub, 'duvidoso', 'duvidosos') : ''].filter(Boolean).join(', ') || 'sem positivos'})` : ''} ·{' '}
            {plural(nRefs, 'referência', 'referências')}
          </span>
        </p>
      )}

      {(a || running) && (
        <ol className="pp-steps" aria-label="Etapas da análise">
          {stages.map((s, i) => {
            const meta = PIPELINE_STEP[s.id as StageId]
            const ms = stageMs(s, now)
            return (
              <li key={s.id} className={`pp-step is-${s.status}`}>
                <StepIcon status={s.status} />
                <span className="pp-num mono">{i + 1}</span>
                <div className="pp-body">
                  <div className="pp-label">
                    {meta?.label ?? s.id}
                    <span className="sr-only"> — {STAGE_STATUS_LABEL[s.status]}</span>
                  </div>
                  <div className="pp-msg">{s.status === 'error' ? <strong>Erro: </strong> : null}{s.message ?? (s.status === 'skipped' ? 'Passo ignorado' : meta?.hint)}</div>
                  {s.status === 'error' && !running && (
                    <button type="button" className="btn btn-sm pp-retry" onClick={() => startAnalysis(c.id)} disabled={!configured}>
                      <RotateCcw size={13} aria-hidden /> Tentar novamente
                    </button>
                  )}
                </div>
                <span className="pp-time mono">{ms !== undefined ? formatDuration(ms) : ''}</span>
              </li>
            )
          })}
        </ol>
      )}
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>

      {a?.triage && (
        <section className="pp-card" aria-labelledby="pp-triage">
          <div className="pp-card-head">
            <h3 id="pp-triage">Triagem</h3>
            <span className={`badge ${a.triage.imageQuality === 'adequate' ? 'badge-normal' : a.triage.imageQuality === 'limited' ? 'badge-significant' : 'badge-critical'}`}>
              Qualidade {a.triage.imageQuality === 'adequate' ? 'adequada' : a.triage.imageQuality === 'limited' ? 'limitada' : 'não diagnóstica'}
            </span>
          </div>
          <p className="muted">
            {MODALITY_LABEL[a.triage.modality]} · {REGION_LABEL[a.triage.region]} · {a.triage.view}
            {a.triage.laterality !== 'none' && a.triage.laterality !== 'unknown' ? ` · ${LATERALITY_LABEL[a.triage.laterality]}` : ''}
            {a.triage.skeletalMaturity === 'skeletally-immature' ? ' · esqueleto imaturo' : ''}
            {a.triage.hardwarePresent ? ' · material de osteossíntese' : ''}
          </p>
          <p>{a.triage.summary}</p>
          {a.triage.qualityNotes && <p className="subtle">{a.triage.qualityNotes}</p>}
        </section>
      )}

      {a?.verification && (
        <section className="pp-card" aria-labelledby="pp-verify">
          <div className="pp-card-head">
            <h3 id="pp-verify">Verificações de segurança</h3>
            <span className={`badge ${a.verification.passed ? 'badge-normal' : 'badge-significant'}`}>{a.verification.passed ? 'Sem bloqueios' : 'A rever'}</span>
          </div>
          {a.verification.issues.length === 0 && <p className="muted">Sem problemas detetados.</p>}
          {a.verification.issues.map((it, i) => (
            <div key={i} className={`pp-issue is-${it.severity}`}>
              {it.severity === 'info' ? <Info size={14} aria-hidden /> : it.severity === 'warning' ? <TriangleAlert size={14} aria-hidden /> : <CircleX size={14} aria-hidden />}
              <div>
                <strong>{it.section}:</strong> {it.message}
              </div>
            </div>
          ))}
        </section>
      )}

      {a && (
        <details className="pp-details">
          <summary>Detalhes técnicos</summary>
          <dl>
            {(
              [
                ['Fornecedor', PROVIDER_LABEL[a.provider] ?? a.provider],
                ['Modelo', a.model],
                ['Idioma', a.language === 'pt-PT' ? 'Português (PT)' : 'Inglês'],
                ['Início', formatDateTime(a.startedAt)],
                ['Fim', formatDateTime(a.finishedAt)],
                [
                  'Tokens',
                  `${usage.inputTokens.toLocaleString('pt-PT')} entrada · ${usage.outputTokens.toLocaleString('pt-PT')} saída${
                    usage.cacheReadTokens ? ` · ${usage.cacheReadTokens.toLocaleString('pt-PT')} cache` : ''
                  }`,
                ],
                ...stages
                  .filter((s) => s.usage)
                  .map((s) => [
                    PIPELINE_STEP[s.id as StageId]?.label ?? s.id,
                    `${s.usage!.inputTokens.toLocaleString('pt-PT')} / ${s.usage!.outputTokens.toLocaleString('pt-PT')} tokens`,
                  ]),
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} className="pp-dl-row">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  )
}
