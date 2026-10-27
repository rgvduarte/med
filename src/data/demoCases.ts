import type { AnalysisResult, Attribution, Case, Frame, Modality, Region, Report, Series } from '../types'
import { loadDicomFile } from '../lib/imaging/dicom'

// Demo cases: openly licensed images shipped in public/demo/ with pre-computed analyses
// (same pipeline and prompts, run ahead of time) so the site shows results without an API key.

interface DemoSeries {
  id: string
  kind: 'image' | 'dicom' | 'video'
  modality: Modality
  region: Region
  view: string
  laterality: Series['laterality']
  description: string
  file?: string
  width?: number
  height?: number
  video?: string
  duration?: number
  keyframes?: { file: string; t: number }[]
}

interface DemoCase {
  id: string
  pseudoId: string
  title: string
  indication: string
  priority: 'routine' | 'urgent'
  teaching: string
  ageYears?: number
  sex?: 'F' | 'M' | 'X'
  series: DemoSeries[]
  attribution: Attribution[]
}

interface DemoAnalysis {
  analysis: AnalysisResult
  report?: Report
}

const BASE = 'demo/'
const CREATED = '2026-10-27T20:00:00.000Z'

async function buildSeries(s: DemoSeries): Promise<Series> {
  const base = { id: s.id, modality: s.modality, region: s.region, view: s.view, laterality: s.laterality, description: s.description }
  if (s.kind === 'video') {
    const frames: Frame[] = (s.keyframes ?? []).map((k, i) => ({
      id: `${s.id}-f${i}`,
      index: i,
      timeSec: k.t,
      url: BASE + k.file,
      width: s.width ?? 0,
      height: s.height ?? 0,
    }))
    return { ...base, kind: 'video', frames, videoUrl: BASE + s.video, durationSec: s.duration }
  }
  if (s.kind === 'dicom') {
    const res = await fetch(BASE + s.file)
    if (!res.ok) throw new Error(`demo DICOM ${res.status}`)
    const file = new File([await res.blob()], s.file!.split('/').pop()!, { type: 'application/dicom' })
    const d = await loadDicomFile(file)
    return {
      ...base,
      kind: 'dicom',
      frames: d.frames.map((f, i) => ({ ...f, id: `${s.id}-f${i}` })),
      dicomMeta: d.meta,
      removedTags: d.removedTags,
    }
  }
  return { ...base, kind: 'image', frames: [{ id: `${s.id}-f0`, index: 0, url: BASE + s.file, width: s.width ?? 0, height: s.height ?? 0 }] }
}

async function loadAnalysis(id: string): Promise<DemoAnalysis | null> {
  try {
    const res = await fetch(`${BASE}analyses/${id}.json`)
    if (!res.ok) return null
    return (await res.json()) as DemoAnalysis
  } catch {
    return null
  }
}

/** Demo cases (openly licensed images + pre-computed analyses) shipped with the site. */
export async function loadDemoCases(): Promise<Case[]> {
  const res = await fetch(`${BASE}cases.json`)
  if (!res.ok) return []
  const defs = (await res.json()) as DemoCase[]
  const out = await Promise.all(
    defs.map(async (d): Promise<Case | null> => {
      try {
        const [series, pre] = await Promise.all([Promise.all(d.series.map(buildSeries)), loadAnalysis(d.id)])
        return {
          id: d.id,
          pseudoId: d.pseudoId,
          title: d.title,
          createdAt: CREATED,
          ageYears: d.ageYears,
          sex: d.sex,
          indication: d.indication.replace(/\s*\((Indicação|Cenário) fictíci[ao][^)]*\)\.?/gi, '').trim(),
          priority: d.priority,
          status: pre?.report ? 'analysed' : 'new',
          series,
          isDemo: true,
          teachingPoint: d.teaching,
          attribution: d.attribution,
          analysis: pre ? { ...pre.analysis, precomputed: true } : undefined,
          report: pre?.report,
          audit: [
            { at: CREATED, actor: 'system', action: 'Caso de demonstração carregado', detail: 'Imagens com licença aberta (ver Informação do caso)' },
            ...(pre ? [{ at: pre.analysis.finishedAt ?? CREATED, actor: 'ai' as const, action: 'Análise pré-calculada', detail: `${pre.analysis.model} · protocolo idêntico ao da app` }] : []),
          ],
        }
      } catch {
        return null
      }
    }),
  )
  return out.filter((c): c is Case => c !== null)
}
