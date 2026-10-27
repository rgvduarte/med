import { describe, expect, it, vi } from 'vitest'

vi.mock('../../store/settings', () => ({ useSettings: { getState: () => ({}) } }))
vi.mock('../imaging/encode', () => ({ encodeFrame: vi.fn() }))

import { citationIssues, toFindings, type ImageRef } from './pipeline'
import type { FindingsOut } from './schemas'
import type { EvidenceItem, Report } from '../../types'

const images: ImageRef[] = [
  { number: 1, seriesId: 's1', frameIndex: 0, caption: '', part: { type: 'text', text: '' } },
  { number: 2, seriesId: 's2', frameIndex: 0, caption: '', part: { type: 'text', text: '' } },
  { number: 3, seriesId: 's2', frameIndex: 3, caption: '', part: { type: 'text', text: '' } },
]

const base = {
  description: 'd',
  anatomic_site: 'escafoide',
  laterality: 'left' as const,
  severity: 'significant' as const,
  relevant_to_question: true,
  classification: null,
  frame_range: null,
  evidence_query: ['scaphoid fracture'],
}

describe('toFindings', () => {
  it('maps certainty/confidence to class and clamps boxes', () => {
    const out: FindingsOut = {
      checklist: [
        { item: 'Fratura do rádio distal', result: 'absent' },
        { item: 'Escafoide', result: 'present' },
        { item: 'Arcos de Gilula', result: 'indeterminate' },
      ],
      findings: [
        { ...base, label: 'Fratura do escafoide', certainty: 'consistent-with', confidence: 'high', locations: [{ image_number: 1, bbox: { x: 0.9, y: -0.1, w: 0.5, h: 0.3 } }] },
        { ...base, label: 'Possível fratura', certainty: 'possible', confidence: 'moderate', locations: [{ image_number: 99, bbox: null }] },
        { ...base, label: 'Quisto', certainty: 'unlikely', confidence: 'low', severity: 'minor', relevant_to_question: false, locations: [] },
      ],
      pertinent_negatives: [],
      limitations: '',
    }
    const f = toFindings(out, images)
    expect(f[0]).toMatchObject({ id: 'F1', cls: 'positive', group: 'priority', status: 'pending', origin: 'ai' })
    const [x, y, w, h] = f[0].locations[0].bbox!
    expect(x).toBe(0.9)
    expect(y).toBe(0)
    expect(x + w).toBeLessThanOrEqual(1)
    expect(h).toBeCloseTo(0.3)
    expect(f[1]).toMatchObject({ cls: 'doubtful', locations: [] })
    expect(f[2]).toMatchObject({ group: 'other' })
    const checklist = f.filter((x) => x.group === 'checklist')
    expect(checklist.map((c) => c.cls)).toEqual(['negative', 'not-assessable'])
  })

  it('maps keyframe ranges only within one series', () => {
    const out: FindingsOut = {
      checklist: [],
      findings: [
        { ...base, label: 'a', certainty: 'possible', confidence: 'low', locations: [], frame_range: { first_image_number: 2, last_image_number: 3 } },
        { ...base, label: 'b', certainty: 'possible', confidence: 'low', locations: [], frame_range: { first_image_number: 1, last_image_number: 3 } },
      ],
      pertinent_negatives: [],
      limitations: '',
    }
    const f = toFindings(out, images)
    expect(f[0].frameRange).toEqual([0, 3])
    expect(f[1].frameRange).toBeUndefined()
  })
})

describe('citationIssues', () => {
  const report: Report = {
    language: 'pt-PT',
    clinicalIndication: '',
    technique: 'RX [kuo2022]',
    comparison: '',
    findingsByRegion: [{ heading: 'Osso', text: 'Fratura [F1] [inventado2020].' }],
    impression: ['x [NLM-1]'],
    recommendations: [],
    limitations: '',
    citations: [],
    status: 'draft',
    generatedBy: '',
    generatedAt: '',
    editedByClinician: false,
  }
  const ev = [{ id: 'kuo2022' }, { id: 'NLM-1' }] as EvidenceItem[]
  it('flags only citations that are not retrieved evidence', () => {
    const issues = citationIssues(report, ev, 'pt-PT')
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('inventado2020')
    expect(issues[0].severity).toBe('error')
  })
})
