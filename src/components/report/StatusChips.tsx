import { BadgeCheck, CircleCheckBig, CircleDashed, CircleMinus, CircleQuestionMark, CircleX, LoaderCircle, Lock, PencilLine, Sparkles, Square, SquareDashed } from 'lucide-react'
import type { ReactNode } from 'react'
import type { FindingClass } from '../../types'
import { CASE_RESULT_HINT, CASE_RESULT_LABEL, FINDING_CLASS_LABEL, REPORT_STATE_HINT, REPORT_STATE_LABEL, type CaseResult, type ReportState } from '../../lib/labels-report'
import '../../styles/report.css'

const RESULT_ICON: Record<CaseResult, ReactNode> = {
  positive: <Square size={12} fill="currentColor" strokeWidth={2} aria-hidden />,
  doubtful: <SquareDashed size={13} strokeWidth={2.2} aria-hidden />,
  negative: <CircleMinus size={13} strokeWidth={2.2} aria-hidden />,
  'not-assessable': <CircleQuestionMark size={13} strokeWidth={2.2} aria-hidden />,
  analysing: <LoaderCircle size={13} className="spin" aria-hidden />,
  new: <CircleDashed size={13} aria-hidden />,
  error: <CircleX size={13} aria-hidden />,
}

/** Status chip: shape + text + colour (never colour alone). */
export function ResultChip({ result, compact = false }: { result: CaseResult; compact?: boolean }) {
  return (
    <span className={`rp-chip rp-res-${result} ${compact ? 'rp-chip-compact' : ''}`} title={CASE_RESULT_HINT[result]}>
      {RESULT_ICON[result]}
      <span>{CASE_RESULT_LABEL[result]}</span>
    </span>
  )
}

export function FindingClassChip({ cls }: { cls: FindingClass }) {
  const icon = cls === 'negative' ? RESULT_ICON.negative : RESULT_ICON[cls]
  return (
    <span className={`rp-chip rp-chip-compact rp-res-${cls}`}>
      {icon}
      <span>{FINDING_CLASS_LABEL[cls]}</span>
    </span>
  )
}

export function ReportStateChip({ state }: { state: ReportState }) {
  if (state === 'none') return <span className="subtle" title={REPORT_STATE_HINT.none}>—</span>
  return (
    <span className={`rp-chip rp-state-${state}`} title={REPORT_STATE_HINT[state]}>
      {state === 'draft' && <Sparkles size={13} aria-hidden />}
      {state === 'review' && <PencilLine size={13} aria-hidden />}
      {state === 'validated' && <BadgeCheck size={13} aria-hidden />}
      <span>{REPORT_STATE_LABEL[state]}</span>
      {state === 'validated' && <Lock size={12} aria-label="bloqueado" />}
    </span>
  )
}

/** Violet «IA» tag required on every AI output (spec §7.4). */
export function AiTag({ label = 'IA' }: { label?: string }) {
  return (
    <span className="rp-ai-tag" title="Sugestão da IA — verificar">
      <Sparkles size={12} aria-hidden />
      {label}
    </span>
  )
}

export function ReviewedTag() {
  return (
    <span className="rp-ok-tag" title="Secção revista pelo médico">
      <CircleCheckBig size={12} aria-hidden />
      Revisto
    </span>
  )
}
