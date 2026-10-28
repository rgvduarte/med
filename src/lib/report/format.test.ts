import { describe, expect, it } from 'vitest'
import type { Case, EvidenceItem, Report } from '../../types'
import { reportToMarkdown, reportToText } from './format'
import { toFhirDiagnosticReport } from './fhir'

const evidence: EvidenceItem[] = [
  { id: 'kuo2022', source: 'kb', title: 'Kuo', citation: 'Kuo RYL et al. Radiology 2022', pmid: '35348381', points: [], findingIds: [] },
  { id: 'NLM-1', source: 'notebooklm', title: 'NotebookLM', citation: 'NotebookLM — 2 fonte(s) do caderno', points: [], findingIds: [] },
]

const c: Case = {
  id: 'c1',
  pseudoId: 'MSK-0001',
  title: 'RX punho',
  createdAt: '2026-03-04T10:00:00Z',
  indication: '',
  priority: 'routine',
  status: 'analysed',
  series: [],
  audit: [],
  analysis: { provider: 'anthropic', model: 'm', language: 'pt-PT', startedAt: '2026-03-04T10:00:00Z', stages: [], findings: [], evidence, notebookLm: [] },
}

const r: Report = {
  language: 'pt-PT',
  clinicalIndication: '',
  technique: '',
  comparison: '',
  findingsByRegion: [],
  impression: ['Fratura [kuo2022] [NLM-1]'],
  recommendations: [],
  limitations: '',
  citations: [],
  status: 'draft',
  generatedBy: 'm',
  generatedAt: '2026-03-05T10:00:00Z',
  editedByClinician: false,
}

describe('report exports', () => {
  it('labels the case date as the upload date, not the study date', () => {
    const text = reportToText(c, r, evidence)
    expect(text).toContain('Data de carregamento:')
    expect(text).not.toContain('Data do estudo')
    expect(reportToText(c, { ...r, language: 'en' }, evidence)).toContain('Upload date:')
  })

  it('marks a cited NotebookLM answer as unverified AI text', () => {
    const text = reportToText(c, r, evidence)
    expect(text).toContain('[2] NotebookLM — 2 fonte(s) do caderno [NotebookLM] (texto de IA, não verificado)')
    expect(text).toMatch(/\[1\] Kuo RYL et al\. Radiology 2022 PMID 35348381\n/)
    expect(reportToMarkdown(c, r, evidence)).toContain('_(texto de IA, não verificado)_')
  })

  it('FHIR: no effective date (study date unknown); upload time kept as provenance', () => {
    const fhir = toFhirDiagnosticReport(c, r, evidence) as Record<string, unknown>
    expect(fhir).not.toHaveProperty('effectiveDateTime')
    expect(fhir.issued).toBe(r.generatedAt)
    expect(JSON.stringify(fhir.extension)).toContain('"url":"uploadedAt","valueDateTime":"2026-03-04T10:00:00Z"')
  })
})
