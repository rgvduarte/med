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
}))

export function useCase(id: string | undefined): Case | undefined {
  return useCases((s) => s.cases.find((c) => c.id === id))
}
