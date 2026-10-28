// Derived, display-only state for cases, reports, findings and evidence.
import type { AnalysisResult, Case, EvidenceItem, Finding, FindingClass, Report } from '../../types'
import { CASE_RESULT_ORDER, type CaseResult, type ReportState } from '../labels-report'

/** Findings the clinician must act on (AI suggestions; the «não detetado» checklist is excluded). */
export function reviewableFindings(c: Case): Finding[] {
  return (c.analysis?.findings ?? []).filter((f) => f.group !== 'checklist')
}

export function pendingFindings(c: Case): Finding[] {
  return reviewableFindings(c).filter((f) => f.status === 'pending')
}

/** Short code shown to the clinician (F1, F2…), following the order of the findings list. */
export function findingCode(c: Case, findingId: string): string {
  const i = (c.analysis?.findings ?? []).findIndex((f) => f.id === findingId)
  return i >= 0 ? `F${i + 1}` : '?'
}

/**
 * Study-level AI result, shared by the worklist, the findings summary and the mobile sheet handle:
 * highest class among the AI's non-rejected, non-checklist findings (priority and other groups).
 * Undefined while a run has not produced a result yet.
 */
export function studyClass(a: AnalysisResult | undefined): FindingClass | undefined {
  if (!a) return undefined
  const active = a.findings.filter((f) => f.origin === 'ai' && f.status !== 'rejected' && f.group !== 'checklist')
  if (active.some((f) => f.cls === 'positive')) return 'positive'
  if (active.some((f) => f.cls === 'doubtful')) return 'doubtful'
  if (a.triage?.imageQuality === 'non-diagnostic') return 'not-assessable'
  // «Negativo» only when the systematic search actually ran (not triage-only, failed or cancelled runs).
  if (!findingsStageDone(a)) return a.finishedAt ? 'not-assessable' : undefined
  if (active.some((f) => f.cls === 'not-assessable')) return 'not-assessable'
  return 'negative'
}

/** Worklist result: pipeline state, else the same study-level class shown inside the case. */
export function caseResult(c: Case): CaseResult {
  if (c.status === 'analysing') return 'analysing'
  if (c.status === 'error') return 'error'
  if (!c.analysis || c.status === 'new') return 'new'
  return studyClass(c.analysis) ?? 'not-assessable'
}

export function findingsStageDone(a: { stages: { id: string; status: string }[] }): boolean {
  return a.stages.some((s) => s.id === 'findings' && s.status === 'done')
}

export function reportState(r: Report | undefined): ReportState {
  if (!r) return 'none'
  if (r.status === 'validated') return 'validated'
  if (r.editedByClinician || (r.reviewedSections?.length ?? 0) > 0) return 'review'
  return 'draft'
}

export type Verification = { kind: 'pmid' | 'doi' | 'notebook' | 'unverified'; label: string }

/**
 * Curated references count as verified when they carry a PMID/DOI. A NotebookLM item is an AI-generated
 * answer, not a checkable reference: like an unverified one, it must be removed or assumed before validation.
 */
export function evidenceVerification(e: EvidenceItem): Verification {
  if (e.source === 'notebooklm') return { kind: 'notebook', label: 'Resposta NotebookLM (texto de IA)' }
  if (e.pmid) return { kind: 'pmid', label: 'PMID verificado' }
  if (e.doi) return { kind: 'doi', label: 'DOI verificado' }
  return { kind: 'unverified', label: 'Não verificada' }
}

export function isVerified(e: EvidenceItem): boolean {
  const k = evidenceVerification(e).kind
  return k === 'pmid' || k === 'doi'
}

/** Finding ids that use a given evidence item (from both directions of the link). */
export function findingsUsingEvidence(c: Case, e: EvidenceItem): Finding[] {
  const findings = c.analysis?.findings ?? []
  return findings.filter((f) => e.findingIds.includes(f.id) || f.evidenceIds.includes(e.id))
}

// ---------------------------------------------------------------------------
// Report written before a finding decision

/** Report sections whose text depends on which findings were kept. */
export const FINDING_DEPENDENT_SECTIONS: readonly string[] = ['findings', 'impression']

/**
 * A finding was rejected, edited or restored after the draft was written: «Achados» and «Conclusão» lose
 * their review mark and the report is flagged until both are reviewed again. Validated reports are untouched.
 */
export function markReportStale(r: Report): Report {
  if (r.status === 'validated') return r
  return { ...r, reportStale: true, reviewedSections: (r.reviewedSections ?? []).filter((k) => !FINDING_DEPENDENT_SECTIONS.includes(k)) }
}

/** Clears the flag once every finding-dependent section has been accepted or edited again. */
export function clearStaleIfReviewed(r: Report): Report {
  if (!r.reportStale) return r
  const reviewed = r.reviewedSections ?? []
  return FINDING_DEPENDENT_SECTIONS.every((k) => reviewed.includes(k)) ? { ...r, reportStale: undefined } : r
}

// ---------------------------------------------------------------------------
// Identifying text burned into the pixels

export interface PixelPrivacy {
  /** Every series is DICOM and declares BurnedInAnnotation = NO. */
  clear: boolean
  /** At least one DICOM series declares BurnedInAnnotation = YES. */
  burnedIn: boolean
}

/** Only DICOM metadata can vouch for the pixels; PNG/JPEG, video and undeclared DICOM may carry burned-in text. */
export function pixelPrivacy(c: Pick<Case, 'series'>): PixelPrivacy {
  return {
    clear: c.series.length > 0 && c.series.every((s) => s.kind === 'dicom' && s.burnedInAnnotation === 'NO'),
    burnedIn: c.series.some((s) => s.kind === 'dicom' && s.burnedInAnnotation === 'YES'),
  }
}

/** Audit action recording the clinician's confirmation; asked once per case. */
export const PIXEL_CONFIRM_ACTION = 'Confirmação: imagens sem dados identificativos gravados'

/** Images are about to leave for a non-local provider and nothing vouches that the pixels carry no identifying text. */
export function needsPixelConfirmation(c: Pick<Case, 'series' | 'audit'>, provider: string): boolean {
  if (provider !== 'anthropic' || pixelPrivacy(c).clear) return false
  return !c.audit.some((e) => e.actor === 'user' && e.action === PIXEL_CONFIRM_ACTION)
}

// ---------------------------------------------------------------------------
// Worklist order

export type WorklistSort = 'priority' | 'date' | 'result'

/**
 * The clinician-set «Urgente» flag always comes first (except in pure date order); the AI result orders
 * cases only when chosen explicitly — the platform is not intended for triage of real patients.
 */
export function compareWorklist(sort: WorklistSort, a: { c: Case; result: CaseResult }, b: { c: Case; result: CaseResult }): number {
  const byDate = a.c.createdAt < b.c.createdAt ? 1 : a.c.createdAt > b.c.createdAt ? -1 : 0
  if (sort === 'date') return byDate
  const byPriority = a.c.priority === b.c.priority ? 0 : a.c.priority === 'urgent' ? -1 : 1
  if (sort === 'priority') return byPriority || byDate
  return byPriority || CASE_RESULT_ORDER[a.result] - CASE_RESULT_ORDER[b.result] || byDate
}
