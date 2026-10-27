// Builds the pre-computed demo analyses in public/demo/analyses/ from the outputs of the same
// pipeline stages (run ahead of time by Claude reading the demo images with the app's exact
// prompts and schemas). Uses the app's own mapping (toFindings) and evidence retrieval.
// Skipped in normal test runs; run with:
//   DEMO_BUILD=prepare  DEMO_DIR=<dir> npx vitest run src/data/demo-build.test.ts
//   DEMO_BUILD=assemble DEMO_DIR=<dir> npx vitest run src/data/demo-build.test.ts
import { describe, expect, it, vi } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'

vi.mock('../store/settings', () => ({ useSettings: { getState: () => ({}) } }))
vi.mock('../lib/imaging/encode', () => ({ encodeFrame: vi.fn() }))

import { toFindings, citationIssues, type ImageRef } from '../lib/vlm/pipeline'
import { FindingsSchema, ReportSchema, TriageSchema, VerifySchema } from '../lib/vlm/schemas'
import { retrieveEvidence } from '../lib/evidence/kb'
import { PROMPT_VERSION } from '../lib/vlm/prompts'
import type { AnalysisResult, Report, StageState, Triage } from '../types'

const MODE = process.env.DEMO_BUILD
const DIR = process.env.DEMO_DIR ?? ''
const MODEL = 'claude-opus-5-5'
const FINISHED = '2026-10-27T23:00:00.000Z'

interface StageAInput {
  id: string
  images: { number: number; seriesId: string; frameIndex: number; width: number; height: number; caption: string }[]
}

function load<T>(p: string): T {
  return JSON.parse(readFileSync(p, 'utf8')) as T
}

function stageA(id: string) {
  const all = load<{ id: string; result: { triage: unknown; findings: unknown } }[]>(`${DIR}/stageA-output.json`)
  const r = all.find((x) => x.id === id)
  if (!r?.result) throw new Error(`missing stage A for ${id}`)
  return { triage: TriageSchema.parse(r.result.triage), findings: FindingsSchema.parse(r.result.findings) }
}

function toTriage(t: ReturnType<typeof stageA>['triage']): Triage {
  return {
    modality: t.modality,
    region: t.region,
    view: t.view,
    laterality: t.laterality,
    imageQuality: t.image_quality,
    qualityNotes: t.quality_notes,
    skeletalMaturity: t.skeletal_maturity,
    hardwarePresent: t.hardware_present,
    summary: t.summary,
  }
}

function prepared(c: StageAInput) {
  const a = stageA(c.id)
  const images: ImageRef[] = c.images.map((im) => ({ ...im, part: { type: 'text', text: '' } }))
  const triage = toTriage(a.triage)
  let findings = toFindings(a.findings, images)
  const evidence = retrieveEvidence(findings, triage, 'pt-PT')
  findings = findings.map((f) => ({ ...f, evidenceIds: evidence.filter((e) => e.findingIds.includes(f.id)).map((e) => e.id) }))
  return { a, triage, findings, evidence }
}

describe.skipIf(!MODE)('demo analyses', () => {
  const inputs = MODE ? load<StageAInput[]>(`${DIR}/stageA-input.json`) : []

  it.runIf(MODE === 'prepare')('prepares stage B inputs (findings + retrieved evidence)', () => {
    const out = inputs.map((c) => {
      const { a, triage, findings, evidence } = prepared(c)
      return {
        id: c.id,
        triage,
        findings: findings
          .filter((f) => f.status !== 'rejected')
          .map((f) => ({
            id: f.id,
            group: f.group,
            class: f.cls,
            label: f.label,
            description: f.description || undefined,
            site: f.anatomicSite || undefined,
            laterality: f.laterality,
            certainty: f.certainty,
            severity: f.severity,
            classification: f.classification,
            evidence_ids: f.evidenceIds.length ? f.evidenceIds : undefined,
            review_status: f.status,
          })),
        pertinentNegatives: a.findings.pertinent_negatives,
        limitations: a.findings.limitations,
        evidence: evidence.map((e) => ({ id: e.id, citation: e.citation, type: e.evidenceType, points: e.points })),
        imagesAssessed: c.images.length,
      }
    })
    writeFileSync(`${DIR}/stageB-input.json`, JSON.stringify(out))
    expect(out.length).toBe(inputs.length)
  })

  it.runIf(MODE === 'assemble')('assembles public/demo/analyses/*.json', () => {
    const b = load<{ id: string; result: { report: unknown; verify: unknown } }[]>(`${DIR}/stageB-output.json`)
    mkdirSync('public/demo/analyses', { recursive: true })
    for (const c of inputs) {
      const rb = b.find((x) => x.id === c.id)?.result
      if (!rb) throw new Error(`missing stage B for ${c.id}`)
      const ro = ReportSchema.parse(rb.report)
      const vo = VerifySchema.parse(rb.verify)
      const { triage, findings, evidence, a } = prepared(c)
      const report: Report = {
        language: 'pt-PT',
        clinicalIndication: ro.clinical_indication,
        technique: ro.technique,
        comparison: ro.comparison,
        findingsByRegion: ro.findings_sections,
        impression: ro.conclusion,
        recommendations: ro.recommendations,
        limitations: ro.limitations,
        citations: ro.citations.map((x) => ({ evidenceId: x.evidence_id, statement: x.statement })),
        status: 'draft',
        generatedBy: `Claude (API Anthropic) · ${MODEL} · pré-calculado`,
        generatedAt: FINISHED,
        editedByClinician: false,
      }
      const issues = [...citationIssues(report, evidence, 'pt-PT'), ...vo.issues]
      const nMain = findings.filter((f) => f.group !== 'checklist').length
      const stage = (id: StageState['id'], message: string): StageState => ({ id, status: 'done', startedAt: FINISHED, finishedAt: FINISHED, message })
      const analysis: AnalysisResult = {
        provider: 'Claude (API Anthropic)',
        model: MODEL,
        language: 'pt-PT',
        startedAt: FINISHED,
        finishedAt: FINISHED,
        precomputed: true,
        stages: [
          stage('preprocess', `${c.images.length} imagem(ns) preparada(s)`),
          stage('triage', `${triage.modality} · ${triage.view}`),
          stage('findings', `${nMain} achado(s) · ${findings.length - nMain} item(ns) da lista de verificação`),
          stage('evidence', `${evidence.length} referência(s) da base curada`),
          stage('report', `${report.impression.length} ponto(s) na conclusão · protocolo ${PROMPT_VERSION}`),
          stage('verify', issues.length ? `${issues.length} observação(ões)` : 'Sem problemas detetados'),
        ],
        triage,
        findings,
        evidence,
        notebookLm: [],
        verification: { passed: vo.passed && issues.every((i) => i.severity !== 'error'), issues },
      }
      void a
      writeFileSync(`public/demo/analyses/${c.id}.json`, JSON.stringify({ analysis, report }, null, 1))
      expect(existsSync(`public/demo/analyses/${c.id}.json`)).toBe(true)
    }
  })
})
