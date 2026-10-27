import type { Case } from '../../types'
import { nowIso } from '../util'
import { reportContentHash } from './hash'
import { aiDeclarationFor } from './format'

/**
 * Audit package: report, findings, evidence, pipeline stages, model versions and the case audit
 * trail. Image pixels and URLs are never included — only series metadata and frame counts.
 */
export async function buildAuditPackage(c: Case) {
  const a = c.analysis
  const r = c.report
  const currentHash = r ? await reportContentHash(r) : undefined
  return {
    schema: 'mskvlm.audit-package/1',
    exportedAt: nowIso(),
    notice: 'Protótipo de investigação e ensino — não é um dispositivo médico. Dados pseudonimizados.',
    case: {
      id: c.id,
      pseudoId: c.pseudoId,
      title: c.title,
      createdAt: c.createdAt,
      ageYears: c.ageYears,
      sex: c.sex,
      indication: c.indication,
      priority: c.priority,
      status: c.status,
      isDemo: c.isDemo ?? false,
      series: c.series.map((s) => ({
        id: s.id,
        kind: s.kind,
        modality: s.modality,
        region: s.region,
        description: s.description,
        view: s.view,
        laterality: s.laterality,
        frames: s.frames.length,
        durationSec: s.durationSec,
        removedTags: s.removedTags ?? [],
      })),
    },
    analysis: a
      ? {
          provider: a.provider,
          model: a.model,
          language: a.language,
          startedAt: a.startedAt,
          finishedAt: a.finishedAt,
          precomputed: a.precomputed ?? false,
          stages: a.stages,
          triage: a.triage,
          findings: a.findings,
          evidence: a.evidence,
          notebookLm: a.notebookLm,
          verification: a.verification,
          totalUsage: a.totalUsage,
        }
      : null,
    report: r
      ? {
          ...r,
          aiDeclaration: aiDeclarationFor(c, r),
          currentContentHash: currentHash,
          hashMatchesValidation: r.contentHash ? r.contentHash === currentHash : null,
        }
      : null,
    audit: c.audit,
  }
}
