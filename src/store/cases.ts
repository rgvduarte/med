import { create } from 'zustand'
import type { AuditEntry, Case, Finding, FindingStatus, Report } from '../types'
import { nowIso } from '../lib/util'

// Cases live in memory only: uploaded images never leave this browser tab except
// when the user explicitly runs an analysis against the provider they configured.

interface CasesState {
  cases: Case[]
  addCase: (c: Case) => void
  upsertCases: (cs: Case[]) => void
  updateCase: (id: string, patch: Partial<Case> | ((c: Case) => Partial<Case>)) => void
  removeCase: (id: string) => void
  audit: (id: string, entry: Omit<AuditEntry, 'at'>) => void
  setFindingStatus: (caseId: string, findingId: string, status: FindingStatus, note?: string) => void
  updateFinding: (caseId: string, findingId: string, patch: Partial<Finding>) => void
  updateReport: (caseId: string, patch: Partial<Report>) => void
  /** Review actions used by the findings panel; each one is written to the audit trail. */
  acceptFinding: (caseId: string, findingId: string) => void
  rejectFinding: (caseId: string, findingId: string, reason: string) => void
  restoreFinding: (caseId: string, findingId: string) => void
  resetFindingReview: (caseId: string, findingId: string) => void
  editFinding: (caseId: string, findingId: string, patch: Pick<Partial<Finding>, 'label' | 'description' | 'anatomicSite' | 'laterality'>) => void
}

const EDITABLE_FIELD_LABEL: Record<string, string> = {
  label: 'designação',
  description: 'descrição',
  anatomicSite: 'localização',
  laterality: 'lateralidade',
}

export const useCases = create<CasesState>((set, get) => ({
  cases: [],
  addCase: (c) => set((s) => ({ cases: [c, ...s.cases] })),
  upsertCases: (cs) =>
    set((s) => {
      const byId = new Map(s.cases.map((c) => [c.id, c]))
      for (const c of cs) if (!byId.has(c.id)) byId.set(c.id, c)
      return { cases: [...byId.values()] }
    }),
  updateCase: (id, patch) =>
    set((s) => ({
      cases: s.cases.map((c) => (c.id === id ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c)),
    })),
  removeCase: (id) => set((s) => ({ cases: s.cases.filter((c) => c.id !== id) })),
  audit: (id, entry) =>
    get().updateCase(id, (c) => ({ audit: [...c.audit, { ...entry, at: nowIso() }] })),
  setFindingStatus: (caseId, findingId, status, note) => {
    get().updateCase(caseId, (c) => {
      if (!c.analysis) return {}
      return {
        analysis: {
          ...c.analysis,
          findings: c.analysis.findings.map((f) =>
            f.id === findingId ? { ...f, status, clinicianNote: note ?? f.clinicianNote } : f,
          ),
        },
      }
    })
    const f = get().cases.find((c) => c.id === caseId)?.analysis?.findings.find((x) => x.id === findingId)
    get().audit(caseId, { actor: 'user', action: `Achado ${status === 'accepted' ? 'aceite' : status === 'rejected' ? 'rejeitado' : status}`, detail: f?.label })
  },
  updateFinding: (caseId, findingId, patch) =>
    get().updateCase(caseId, (c) =>
      c.analysis
        ? { analysis: { ...c.analysis, findings: c.analysis.findings.map((f) => (f.id === findingId ? { ...f, ...patch } : f)) } }
        : {},
    ),
  updateReport: (caseId, patch) =>
    get().updateCase(caseId, (c) => (c.report ? { report: { ...c.report, ...patch } } : {})),
  acceptFinding: (caseId, findingId) => {
    const f = findFinding(get().cases, caseId, findingId)
    if (!f) return
    get().updateFinding(caseId, findingId, { status: 'accepted', rejectReason: undefined })
    get().audit(caseId, { actor: 'user', action: 'Achado aceite', detail: f.label })
  },
  rejectFinding: (caseId, findingId, reason) => {
    const f = findFinding(get().cases, caseId, findingId)
    if (!f) return
    get().updateFinding(caseId, findingId, { status: 'rejected', rejectReason: reason })
    get().audit(caseId, { actor: 'user', action: 'Achado rejeitado', detail: `${f.label} — «${reason}»` })
  },
  restoreFinding: (caseId, findingId) => {
    const f = findFinding(get().cases, caseId, findingId)
    if (!f) return
    get().updateFinding(caseId, findingId, { status: 'pending', rejectReason: undefined })
    get().audit(caseId, { actor: 'user', action: 'Achado restaurado', detail: f.label })
  },
  resetFindingReview: (caseId, findingId) => {
    const f = findFinding(get().cases, caseId, findingId)
    if (!f) return
    get().updateFinding(caseId, findingId, { status: 'pending', rejectReason: undefined })
    get().audit(caseId, { actor: 'user', action: 'Revisão do achado anulada', detail: f.label })
  },
  editFinding: (caseId, findingId, patch) => {
    const f = findFinding(get().cases, caseId, findingId)
    if (!f) return
    const changed = (Object.keys(patch) as (keyof typeof patch)[]).filter((k) => patch[k] !== undefined && patch[k] !== f[k])
    get().updateFinding(caseId, findingId, { ...patch, status: 'edited', rejectReason: undefined })
    get().audit(caseId, {
      actor: 'user',
      action: 'Achado editado',
      detail: `${patch.label ?? f.label}${changed.length ? ` — alterado: ${changed.map((k) => EDITABLE_FIELD_LABEL[k]).join(', ')}` : ''}`,
    })
  },
}))

function findFinding(cases: Case[], caseId: string, findingId: string): Finding | undefined {
  return cases.find((c) => c.id === caseId)?.analysis?.findings.find((f) => f.id === findingId)
}

export function useCase(id: string | undefined): Case | undefined {
  return useCases((s) => s.cases.find((c) => c.id === id))
}
