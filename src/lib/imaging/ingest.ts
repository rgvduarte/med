import type { Modality, Region, Series } from '../../types'
import { uid } from '../util'
import { isDicomFile, loadDicomFile, type DicomLoadResult } from './dicom'
import { loadImageFile } from './image'
import { extractKeyframes } from './video'

export interface IngestOptions {
  maxKeyframes: number
  onProgress?: (label: string, fraction: number) => void
}

export interface IngestResult {
  series: Series[]
  warnings: string[]
  errors: string[]
}

export const ACCEPTED_FILES = 'image/png,image/jpeg,image/webp,video/mp4,video/webm,video/ogg,video/quicktime,.dcm,.dicom,application/dicom'

function guessRegionFromName(name: string): Region {
  const s = name.toLowerCase()
  if (/ombro|shoulder|coifa|cuff|supraspin/.test(s)) return 'shoulder'
  if (/cotovelo|elbow|epicond/.test(s)) return 'elbow'
  if (/punho|wrist|m[aã]o|hand|escaf|scaph|radius|r[aá]dio|carp/.test(s)) return 'wrist-hand'
  if (/anca|hip|pelv|bacia|femoral.neck|colo/.test(s)) return 'hip-pelvis'
  if (/joelho|knee|menisc|lca|acl|patel/.test(s)) return 'knee'
  if (/tornozelo|ankle|p[eé]|foot|aquil|achill|plantar|calc/.test(s)) return 'ankle-foot'
  if (/coluna|spine|lomb|lumb|cerv|dors|vertebr/.test(s)) return 'spine'
  return 'other'
}

/**
 * Orders the instances of one DICOM series: by InstanceNumber when every instance has one, else by
 * position along the slice normal, else in the order the files were given.
 */
export function sortInstances<T extends { instanceNumber?: number; slicePosition?: number }>(items: T[]): T[] {
  const byKey = (key: 'instanceNumber' | 'slicePosition') =>
    items.every((m) => m[key] !== undefined) ? [...items].sort((a, b) => a[key]! - b[key]!) : undefined
  return byKey('instanceNumber') ?? byKey('slicePosition') ?? items
}

/** BurnedInAnnotation of a merged series: YES if any file says YES, NO only if all say NO, else unknown. */
export function combineBurnedIn(values: (Series['burnedInAnnotation'] | undefined)[]): Series['burnedInAnnotation'] {
  if (values.includes('YES')) return 'YES'
  return values.length > 0 && values.every((v) => v === 'NO') ? 'NO' : undefined
}

/**
 * Turns dropped files into de-identified series. Nothing is uploaded anywhere.
 * File names never reach a series, a warning or an error (they often carry patient names):
 * files are referred to by their position («Ficheiro 2», «Imagem 2», «Clip 2»).
 */
export async function ingestFiles(files: File[], opts: IngestOptions): Promise<IngestResult> {
  const series: Series[] = []
  const warnings: string[] = []
  const errors: string[] = []
  // One-file-per-image DICOM exports: files sharing a SeriesInstanceUID become one series.
  // The UID only lives in this map for the duration of the ingest.
  const dicomGroups = new Map<string, { series: Series; members: DicomLoadResult[] }>()

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const n = i + 1
    const base = i / files.length
    const span = 1 / files.length
    opts.onProgress?.(`A processar ${file.name}…`, base)
    try {
      const head = new Uint8Array(await file.slice(0, 132).arrayBuffer())
      if (isDicomFile(file, head)) {
        const r = await loadDicomFile(file)
        warnings.push(...r.warnings.map((w) => `Ficheiro ${n}: ${w}`))
        if (r.removedTags.length) {
          warnings.push(`Ficheiro ${n}: removidos ${r.removedTags.length} atributos identificáveis (${r.removedTags.slice(0, 4).join(', ')}${r.removedTags.length > 4 ? '…' : ''}).`)
        }
        const group = r.groupKey ? dicomGroups.get(r.groupKey) : undefined
        if (group) {
          group.members.push(r)
          continue
        }
        const s: Series = {
          id: uid('se'),
          kind: 'dicom',
          modality: r.modality,
          region: r.region === 'other' ? guessRegionFromName(file.name) : r.region,
          description: r.meta.SeriesDescription || r.meta.BodyPartExamined || 'Série DICOM',
          view: r.meta.ViewPosition,
          laterality: r.meta.ImageLaterality === 'L' || r.meta.Laterality === 'L' ? 'left' : r.meta.ImageLaterality === 'R' || r.meta.Laterality === 'R' ? 'right' : 'unknown',
          frames: r.frames,
          dicomMeta: r.meta,
          removedTags: r.removedTags,
          burnedInAnnotation: r.burnedInAnnotation,
        }
        series.push(s)
        if (r.groupKey) dicomGroups.set(r.groupKey, { series: s, members: [r] })
      } else if (file.type.startsWith('video/') || /\.(mp4|webm|ogv|ogg|mov)$/i.test(file.name)) {
        const url = URL.createObjectURL(file)
        const r = await extractKeyframes(url, {
          maxFrames: opts.maxKeyframes,
          onProgress: (d, t) => opts.onProgress?.(`A extrair fotogramas-chave de ${file.name}…`, base + (span * d) / t),
        })
        series.push({
          id: uid('se'),
          kind: 'video',
          modality: 'US' as Modality,
          region: guessRegionFromName(file.name),
          description: `Clip ${n}`,
          frames: r.frames,
          videoUrl: r.videoUrl,
          durationSec: r.durationSec,
        })
        warnings.push(`Ficheiro ${n}: modalidade assumida como ecografia — confirme na triagem.`)
      } else if (file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name)) {
        const frame = await loadImageFile(file)
        series.push({
          id: uid('se'),
          kind: 'image',
          modality: 'XR',
          region: guessRegionFromName(file.name),
          description: `Imagem ${n}`,
          frames: [frame],
        })
      } else {
        errors.push(`Ficheiro ${n}: formato não suportado.`)
      }
    } catch (e) {
      errors.push(`Ficheiro ${n}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  for (const { series: s, members } of dicomGroups.values()) {
    if (members.length < 2) continue
    s.frames = sortInstances(members)
      .flatMap((m) => m.frames)
      .map((f, index) => ({ ...f, index }))
    s.removedTags = [...new Set(members.flatMap((m) => m.removedTags))]
    s.burnedInAnnotation = combineBurnedIn(members.map((m) => m.burnedInAnnotation))
  }
  opts.onProgress?.('Concluído', 1)
  return { series, warnings, errors }
}
