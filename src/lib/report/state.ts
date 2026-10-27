// Derived, display-only state for cases, reports, findings and evidence.
import type { Case, EvidenceItem, Finding, Report } from '../../types'
import type { CaseResult, ReportState } from '../labels-report'

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

/** Study-level result: highest class among non-rejected, non-checklist findings. */
export function caseResult(c: Case): CaseResult {
  if (c.status === 'analysing') return 'analysing'
  if (c.status === 'error' && !c.analysis) return 'error'
  const a = c.analysis
  if (!a) return 'new'
  if (a.triage?.imageQuality === 'non-diagnostic') return 'not-assessable'
  const active = a.findings.filter((f) => f.status !== 'rejected' && f.group !== 'checklist')
  if (active.some((f) => f.cls === 'positive')) return 'positive'
  if (active.some((f) => f.cls === 'doubtful')) return 'doubtful'
  if (active.length > 0 && active.every((f) => f.cls === 'not-assessable')) return 'not-assessable'
  return 'negative'
}

export function reportState(r: Report | undefined): ReportState {
  if (!r) return 'none'
  if (r.status === 'validated') return 'validated'
  if (r.editedByClinician || (r.reviewedSections?.length ?? 0) > 0) return 'review'
  return 'draft'
}

export type Verification = { kind: 'pmid' | 'doi' | 'notebook' | 'unverified'; label: string }

/** A reference counts as verified when it carries a PMID/DOI from the curated base or is a notebook source. */
export function evidenceVerification(e: EvidenceItem): Verification {
  if (e.source === 'notebooklm') return { kind: 'notebook', label: 'Fonte do caderno' }
  if (e.pmid) return { kind: 'pmid', label: 'PMID verificado' }
  if (e.doi) return { kind: 'doi', label: 'DOI verificado' }
  return { kind: 'unverified', label: 'Não verificada' }
}

export function isVerified(e: EvidenceItem): boolean {
  return evidenceVerification(e).kind !== 'unverified'
}

/** Finding ids that use a given evidence item (from both directions of the link). */
export function findingsUsingEvidence(c: Case, e: EvidenceItem): Finding[] {
  const findings = c.analysis?.findings ?? []
  return findings.filter((f) => e.findingIds.includes(f.id) || f.evidenceIds.includes(e.id))
}
