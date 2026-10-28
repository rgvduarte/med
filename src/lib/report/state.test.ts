import { describe, expect, it } from 'vitest'
import type { AnalysisResult, Case, EvidenceItem, Finding, Report, Series } from '../../types'
import {
  PIXEL_CONFIRM_ACTION,
  caseResult,
  clearStaleIfReviewed,
  compareWorklist,
  isVerified,
  markReportStale,
  needsPixelConfirmation,
  pixelPrivacy,
  studyClass,
} from './state'

let n = 0
function finding(p: Partial<Finding>): Finding {
  n += 1
  return {
    id: `F${n}`,
    origin: 'ai',
    cls: 'positive',
    group: 'priority',
    label: `Achado ${n}`,
    description: '',
    anatomicSite: '',
    laterality: 'none',
    certainty: 'possible',
    severity: 'minor',
    confidence: 'moderate',
    locations: [],
    evidenceQuery: [],
    evidenceIds: [],
    status: 'pending',
    ...p,
  }
}

function analysis(findings: Finding[], p: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    provider: 'anthropic',
    model: 'm',
    language: 'pt-PT',
    startedAt: '2026-01-01T00:00:00Z',
    finishedAt: '2026-01-01T00:01:00Z',
    stages: [{ id: 'findings', status: 'done' }],
    findings,
    evidence: [],
    notebookLm: [],
    ...p,
  }
}

function kase(a: AnalysisResult | undefined, p: Partial<Case> = {}): Case {
  return { id: 'c1', pseudoId: 'MSK-0001', title: 't', createdAt: '2026-01-01T00:00:00Z', indication: '', priority: 'routine', status: a ? 'analysed' : 'new', series: [], audit: [], analysis: a, ...p }
}

function report(p: Partial<Report> = {}): Report {
  return {
    language: 'pt-PT',
    clinicalIndication: '',
    technique: '',
    comparison: '',
    findingsByRegion: [],
    impression: [],
    recommendations: [],
    limitations: '',
    citations: [],
    status: 'draft',
    generatedBy: 'm',
    generatedAt: '2026-01-01T00:00:00Z',
    editedByClinician: false,
    ...p,
  }
}

describe('studyClass / caseResult (one rule for worklist and case)', () => {
  const same = (a: AnalysisResult) => {
    const sc = studyClass(a)
    expect(caseResult(kase(a))).toBe(sc)
    return sc
  }

  it('counts positive findings in the «other» group (was POSITIVO in the list, DUVIDOSO in the case)', () => {
    expect(same(analysis([finding({ cls: 'doubtful' }), finding({ cls: 'positive', group: 'other' })]))).toBe('positive')
  })

  it('a doubtful «other» finding is never NEGATIVO (was DUVIDOSO in the list, NEGATIVO in the case)', () => {
    expect(same(analysis([finding({ cls: 'doubtful', group: 'other' }), finding({ cls: 'negative', group: 'checklist' })]))).toBe('doubtful')
  })

  it('excludes rejected findings', () => {
    expect(same(analysis([finding({ cls: 'positive', status: 'rejected' }), finding({ cls: 'doubtful' })]))).toBe('doubtful')
  })

  it('ignores «indeterminate» checklist items but not an unassessable reviewable finding', () => {
    expect(same(analysis([finding({ cls: 'not-assessable', group: 'checklist' }), finding({ cls: 'negative', group: 'checklist' })]))).toBe('negative')
    expect(same(analysis([finding({ cls: 'not-assessable', group: 'other' })]))).toBe('not-assessable')
  })

  it('positive wins over a non-diagnostic triage; otherwise non-diagnostic is «não avaliável»', () => {
    const triage = { imageQuality: 'non-diagnostic' } as AnalysisResult['triage']
    expect(same(analysis([finding({ cls: 'positive' })], { triage }))).toBe('positive')
    expect(same(analysis([], { triage }))).toBe('not-assessable')
  })

  it('never negative when the systematic search did not complete', () => {
    expect(same(analysis([], { stages: [{ id: 'findings', status: 'error' }] }))).toBe('not-assessable')
    expect(studyClass(analysis([], { stages: [{ id: 'findings', status: 'running' }], finishedAt: undefined }))).toBeUndefined()
  })

  it('pipeline states come first in the worklist', () => {
    expect(caseResult(kase(analysis([finding({})]), { status: 'analysing' }))).toBe('analysing')
    expect(caseResult(kase(undefined))).toBe('new')
  })
})

describe('report staleness after finding decisions', () => {
  it('drops the review marks of «Achados» and «Conclusão» and flags the draft', () => {
    const r = markReportStale(report({ reviewedSections: ['indication', 'findings', 'impression'] }))
    expect(r.reportStale).toBe(true)
    expect(r.reviewedSections).toEqual(['indication'])
  })

  it('leaves a validated report untouched', () => {
    const v = report({ status: 'validated', reviewedSections: ['impression'] })
    expect(markReportStale(v)).toBe(v)
  })

  it('clears only once both sections are reviewed again', () => {
    const stale = markReportStale(report({ reviewedSections: ['impression'] }))
    expect(clearStaleIfReviewed({ ...stale, reviewedSections: ['impression'] }).reportStale).toBe(true)
    expect(clearStaleIfReviewed({ ...stale, reviewedSections: ['impression', 'findings'] }).reportStale).toBeUndefined()
  })
})

describe('pixel privacy', () => {
  const dicom = (b?: 'YES' | 'NO'): Series => ({ id: 's', kind: 'dicom', modality: 'XR', region: 'knee', description: '', frames: [], burnedInAnnotation: b })
  const png: Series = { id: 'p', kind: 'image', modality: 'XR', region: 'knee', description: '', frames: [] }

  it('is clear only when every series is DICOM with BurnedInAnnotation = NO', () => {
    expect(pixelPrivacy({ series: [dicom('NO'), dicom('NO')] })).toEqual({ clear: true, burnedIn: false })
    expect(pixelPrivacy({ series: [dicom('NO'), png] }).clear).toBe(false)
    expect(pixelPrivacy({ series: [dicom()] }).clear).toBe(false)
    expect(pixelPrivacy({ series: [dicom('YES')] })).toEqual({ clear: false, burnedIn: true })
    expect(pixelPrivacy({ series: [] }).clear).toBe(false)
  })

  it('asks once per case, only before sending to the external provider', () => {
    const c = { series: [png], audit: [] as Case['audit'] }
    expect(needsPixelConfirmation(c, 'anthropic')).toBe(true)
    expect(needsPixelConfirmation(c, 'openai-compatible')).toBe(false)
    expect(needsPixelConfirmation(c, 'browser')).toBe(false)
    expect(needsPixelConfirmation({ series: [dicom('NO')], audit: [] }, 'anthropic')).toBe(false)
    const confirmed = { ...c, audit: [{ at: '', actor: 'user' as const, action: PIXEL_CONFIRM_ACTION }] }
    expect(needsPixelConfirmation(confirmed, 'anthropic')).toBe(false)
  })
})

describe('NotebookLM answers are not verified references', () => {
  const e = (p: Partial<EvidenceItem>): EvidenceItem => ({ id: 'x', source: 'kb', title: '', citation: '', points: [], findingIds: [], ...p })
  it('needs PMID or DOI', () => {
    expect(isVerified(e({ pmid: '1' }))).toBe(true)
    expect(isVerified(e({ doi: '10.1/x' }))).toBe(true)
    expect(isVerified(e({}))).toBe(false)
    expect(isVerified(e({ id: 'NLM-1', source: 'notebooklm' }))).toBe(false)
  })
})

describe('compareWorklist', () => {
  const row = (id: string, priority: Case['priority'], createdAt: string, result: ReturnType<typeof caseResult>) => ({
    c: kase(undefined, { id, priority, createdAt }),
    result,
  })
  const rows = [
    row('neg-urgent', 'urgent', '2026-01-01', 'negative'),
    row('pos-routine', 'routine', '2026-01-03', 'positive'),
    row('dub-urgent', 'urgent', '2026-01-02', 'doubtful'),
    row('new-routine', 'routine', '2026-01-04', 'new'),
  ]
  const order = (s: Parameters<typeof compareWorklist>[0]) => [...rows].sort((a, b) => compareWorklist(s, a, b)).map((r) => r.c.id)

  it('priority: urgent first, then most recent upload — the AI result plays no part', () => {
    expect(order('priority')).toEqual(['dub-urgent', 'neg-urgent', 'new-routine', 'pos-routine'])
  })
  it('result: urgent first, then AI class', () => {
    expect(order('result')).toEqual(['dub-urgent', 'neg-urgent', 'pos-routine', 'new-routine'])
  })
  it('date: most recent upload first', () => {
    expect(order('date')).toEqual(['new-routine', 'pos-routine', 'dub-urgent', 'neg-urgent'])
  })
})
