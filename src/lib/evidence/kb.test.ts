import { describe, expect, it } from 'vitest'
import { KB, retrieveEvidence, scoreEntry, tokens } from './kb'
import type { Finding, Triage } from '../../types'

const triage: Triage = {
  modality: 'US',
  region: 'shoulder',
  view: 'longitudinal',
  laterality: 'right',
  imageQuality: 'adequate',
  qualityNotes: '',
  skeletalMaturity: 'adult',
  hardwarePresent: false,
  summary: '',
}

function finding(p: Partial<Finding>): Finding {
  return {
    id: 'F1',
    origin: 'ai',
    cls: 'doubtful',
    group: 'priority',
    label: '',
    description: '',
    anatomicSite: '',
    laterality: 'right',
    certainty: 'possible',
    severity: 'significant',
    confidence: 'moderate',
    locations: [],
    evidenceQuery: [],
    evidenceIds: [],
    status: 'pending',
    ...p,
  }
}

describe('evidence base', () => {
  it('has unique ids and complete metadata', () => {
    const ids = new Set(KB.map((e) => e.id))
    expect(ids.size).toBe(KB.length)
    for (const e of KB) {
      expect(e.title.length).toBeGreaterThan(10)
      expect(e.doi || e.url).toBeTruthy()
      expect(e.key_points.length).toBe(e.key_points_pt.length)
    }
  })

  it('normalises accents and plurals', () => {
    expect(tokens('Roturas da Coifa — ecografia')).toEqual(['rotura', 'coifa', 'ecografia'])
  })

  it('retrieves shoulder ultrasound evidence for a rotator cuff tear and not knee papers', () => {
    const f = finding({ label: 'Rotura de espessura parcial do supraespinhoso', evidenceQuery: ['rotator cuff tear', 'partial-thickness tear', 'ultrasound'] })
    const ev = retrieveEvidence([f], triage, 'pt-PT')
    const forF = ev.filter((e) => e.findingIds.includes('F1'))
    expect(forF.length).toBeGreaterThan(0)
    for (const e of forF) {
      const entry = KB.find((k) => k.id === e.id)!
      expect(entry.regions.some((r) => r === 'shoulder' || r === 'any')).toBe(true)
    }
    expect(forF[0].points[0]).toMatch(/[ãçéó]/) // pt-PT key points
  })

  it('ignores rejected and negative findings', () => {
    const ev = retrieveEvidence(
      [finding({ status: 'rejected', evidenceQuery: ['rotator cuff tear'] }), finding({ id: 'C1', cls: 'negative', group: 'checklist', label: 'rotator cuff tear' })],
      triage,
      'en',
    )
    expect(ev.every((e) => e.findingIds.length === 0)).toBe(true)
  })

  it('penalises region mismatch', () => {
    const q = tokens('rotator cuff tear ultrasound')
    const shoulder = KB.find((e) => e.regions.includes('shoulder'))!
    expect(scoreEntry(shoulder, q, 'shoulder', 'US')).toBeGreaterThan(scoreEntry(shoulder, q, 'knee', 'US'))
  })
})
