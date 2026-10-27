import * as dicomParser from 'dicom-parser'
import type { DicomPixels, Frame, Modality, Region } from '../../types'
import { uid } from '../util'

// DICOM PS3.15 Annex E (Basic Application Level Confidentiality Profile) — a practical
// subset of identifying attributes. We never copy these anywhere; we only report that
// they were present so the user knows the file carried PHI.
const PHI_TAGS: Record<string, string> = {
  x00100010: 'PatientName',
  x00100020: 'PatientID',
  x00100030: 'PatientBirthDate',
  x00100032: 'PatientBirthTime',
  x00101000: 'OtherPatientIDs',
  x00101001: 'OtherPatientNames',
  x00101040: 'PatientAddress',
  x00102154: 'PatientTelephoneNumbers',
  x00080050: 'AccessionNumber',
  x00080080: 'InstitutionName',
  x00080081: 'InstitutionAddress',
  x00080090: 'ReferringPhysicianName',
  x00081048: 'PhysiciansOfRecord',
  x00081050: 'PerformingPhysicianName',
  x00081060: 'NameOfPhysiciansReadingStudy',
  x00081070: 'OperatorsName',
  x00081010: 'StationName',
  x00080020: 'StudyDate',
  x00080030: 'StudyTime',
  x00200010: 'StudyID',
  x0020000d: 'StudyInstanceUID',
  x0020000e: 'SeriesInstanceUID',
  x00080018: 'SOPInstanceUID',
  x00321032: 'RequestingPhysician',
  x00400275: 'RequestAttributesSequence',
  x00104000: 'PatientComments',
}

// Attributes considered safe to display and to pass to the model.
const SAFE_TAGS: Record<string, string> = {
  x00080060: 'Modality',
  x00180015: 'BodyPartExamined',
  x00185101: 'ViewPosition',
  x00200062: 'ImageLaterality',
  x00200060: 'Laterality',
  x0008103e: 'SeriesDescription',
  x00280010: 'Rows',
  x00280011: 'Columns',
  x00280030: 'PixelSpacing',
  x00181164: 'ImagerPixelSpacing',
  x00280004: 'PhotometricInterpretation',
  x00280008: 'NumberOfFrames',
  x00180050: 'SliceThickness',
  x00100040: 'PatientSex',
  x00101010: 'PatientAge',
}

const TS_IMPLICIT_LE = '1.2.840.10008.1.2'
const TS_EXPLICIT_LE = '1.2.840.10008.1.2.1'
const TS_DEFLATED = '1.2.840.10008.1.2.1.99'
const TS_EXPLICIT_BE = '1.2.840.10008.1.2.2'
const TS_JPEG_BASELINE = '1.2.840.10008.1.2.4.50'

export interface DicomLoadResult {
  frames: Frame[]
  modality: Modality
  region: Region
  meta: Record<string, string>
  removedTags: string[]
  burnedInAnnotation: boolean
  warnings: string[]
}

function mapModality(m: string | undefined): Modality {
  switch ((m ?? '').toUpperCase()) {
    case 'CR':
    case 'DX':
    case 'DR':
    case 'RG':
      return 'XR'
    case 'CT':
      return 'CT'
    case 'MR':
      return 'MR'
    case 'US':
      return 'US'
    case 'XA':
    case 'RF':
      return 'XA'
    default:
      return 'OT'
  }
}

export function mapBodyPart(bp: string | undefined): Region {
  const s = (bp ?? '').toUpperCase()
  if (/SHOULDER|CLAVICLE|SCAPULA|HUMERUS/.test(s)) return 'shoulder'
  if (/ELBOW/.test(s)) return 'elbow'
  if (/WRIST|HAND|FINGER|SCAPHOID|FOREARM/.test(s)) return 'wrist-hand'
  if (/HIP|PELVIS|SACRUM|FEMUR/.test(s)) return /FEMUR/.test(s) ? 'long-bones' : 'hip-pelvis'
  if (/KNEE|PATELLA/.test(s)) return 'knee'
  if (/ANKLE|FOOT|TOE|CALCANEUS|HEEL/.test(s)) return 'ankle-foot'
  if (/SPINE|CSPINE|TSPINE|LSPINE|NECK/.test(s)) return 'spine'
  if (/TIBIA|FIBULA|LEG|ARM/.test(s)) return 'long-bones'
  return 'other'
}

/** Applies window/level to raw pixels and writes an 8-bit RGBA buffer. */
export function renderWindowed(px: DicomPixels, wc: number, ww: number, invert: boolean, out: Uint8ClampedArray) {
  const lo = wc - 0.5 - (ww - 1) / 2
  const range = Math.max(1, ww - 1)
  const n = px.rows * px.columns
  const { data, slope, intercept } = px
  for (let i = 0; i < n; i++) {
    const v = data[i] * slope + intercept
    let g = ((v - lo) / range) * 255
    g = g < 0 ? 0 : g > 255 ? 255 : g
    if (invert) g = 255 - g
    const o = i * 4
    out[o] = out[o + 1] = out[o + 2] = g
    out[o + 3] = 255
  }
}

function pixelsToDataUrl(px: DicomPixels): string {
  const canvas = document.createElement('canvas')
  canvas.width = px.columns
  canvas.height = px.rows
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(px.columns, px.rows)
  renderWindowed(px, px.windowCenter, px.windowWidth, px.invert, img.data)
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

function autoWindow(data: ArrayLike<number>, slope: number, intercept: number): [number, number] {
  // 1st–99th percentile from a strided sample — robust to burned-in labels/background.
  const step = Math.max(1, Math.floor(data.length / 50000))
  const vals: number[] = []
  for (let i = 0; i < data.length; i += step) vals.push(data[i] * slope + intercept)
  vals.sort((a, b) => a - b)
  const lo = vals[Math.floor(vals.length * 0.01)] ?? 0
  const hi = vals[Math.floor(vals.length * 0.99)] ?? 1
  return [(lo + hi) / 2, Math.max(1, hi - lo)]
}

async function decodeJpegFrame(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes)
  const blob = new Blob([copy.buffer], { type: 'image/jpeg' })
  const bmp = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  canvas.getContext('2d')!.drawImage(bmp, 0, 0)
  return canvas.toDataURL('image/png')
}

/**
 * Parses a DICOM Part 10 file in the browser, de-identifies it (only whitelisted,
 * non-identifying attributes are retained) and renders each frame to 8-bit.
 * Supported: uncompressed little-endian (implicit/explicit) and JPEG baseline.
 */
export async function loadDicomFile(file: File, maxFrames = 32): Promise<DicomLoadResult> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let ds: dicomParser.DataSet
  try {
    ds = dicomParser.parseDicom(bytes)
  } catch (e) {
    throw new Error(`Ficheiro DICOM inválido ou não suportado: ${e instanceof Error ? e.message : String(e)}`)
  }

  const removedTags = Object.entries(PHI_TAGS)
    .filter(([tag]) => ds.elements[tag] && ds.elements[tag].length > 0)
    .map(([, name]) => name)

  const meta: Record<string, string> = {}
  for (const [tag, name] of Object.entries(SAFE_TAGS)) {
    const v = ds.string(tag)
    if (v) meta[name] = v
  }

  const warnings: string[] = []
  const burnedIn = (ds.string('x00280301') ?? '').toUpperCase() === 'YES'
  if (burnedIn) warnings.push('O ficheiro indica anotações gravadas na imagem (BurnedInAnnotation=YES): podem existir dados identificáveis nos píxeis.')

  const ts = ds.string('x00020010') ?? TS_IMPLICIT_LE
  const rows = ds.uint16('x00280010') ?? 0
  const columns = ds.uint16('x00280011') ?? 0
  const bitsAllocated = ds.uint16('x00280100') ?? 16
  const pixelRep = ds.uint16('x00280103') ?? 0
  const samples = ds.uint16('x00280002') ?? 1
  const photometric = (ds.string('x00280004') ?? 'MONOCHROME2').toUpperCase()
  const nFrames = Math.max(1, ds.intString('x00280008') ?? 1)
  const slope = ds.floatString('x00281053') ?? 1
  const intercept = ds.floatString('x00281052') ?? 0
  const spacingStr = ds.string('x00280030') ?? ds.string('x00181164')
  const spacing = spacingStr?.split('\\').map(Number)
  const pixelSpacing: [number, number] | undefined =
    spacing && spacing.length === 2 && spacing.every((n) => Number.isFinite(n) && n > 0) ? [spacing[0], spacing[1]] : undefined

  const pixelEl = ds.elements['x7fe00010']
  if (!pixelEl) throw new Error('O ficheiro DICOM não contém dados de imagem (PixelData).')
  if (!rows || !columns) throw new Error('Dimensões da imagem DICOM em falta.')

  const frames: Frame[] = []
  const count = Math.min(nFrames, maxFrames)
  if (nFrames > maxFrames) warnings.push(`Apenas as primeiras ${maxFrames} de ${nFrames} imagens foram carregadas.`)

  if (ts === TS_JPEG_BASELINE && pixelEl.encapsulatedPixelData) {
    for (let f = 0; f < count; f++) {
      const frameBytes =
        nFrames === 1
          ? dicomParser.readEncapsulatedPixelDataFromFragments(ds, pixelEl, 0, pixelEl.fragments?.length)
          : dicomParser.readEncapsulatedImageFrame(ds, pixelEl, f, dicomParser.createJPEGBasicOffsetTable(ds, pixelEl))
      const url = await decodeJpegFrame(frameBytes as Uint8Array)
      frames.push({ id: uid('fr'), index: f, url, width: columns, height: rows, pixelSpacing })
    }
  } else if (ts === TS_IMPLICIT_LE || ts === TS_EXPLICIT_LE) {
    if (pixelEl.encapsulatedPixelData) throw new Error('Pixel data encapsulado com sintaxe não comprimida — ficheiro inconsistente.')
    const frameSize = rows * columns * samples
    const bytesPer = bitsAllocated / 8
    for (let f = 0; f < count; f++) {
      const offset = pixelEl.dataOffset + f * frameSize * bytesPer
      const buf = bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + offset + frameSize * bytesPer)
      if (samples === 3) {
        // RGB (e.g. ultrasound) — render directly, no windowing.
        const src = new Uint8Array(buf)
        const canvas = document.createElement('canvas')
        canvas.width = columns
        canvas.height = rows
        const ctx = canvas.getContext('2d')!
        const img = ctx.createImageData(columns, rows)
        const planar = ds.uint16('x00280006') === 1
        for (let i = 0; i < rows * columns; i++) {
          const o = i * 4
          if (planar) {
            img.data[o] = src[i]
            img.data[o + 1] = src[i + rows * columns]
            img.data[o + 2] = src[i + 2 * rows * columns]
          } else {
            img.data[o] = src[i * 3]
            img.data[o + 1] = src[i * 3 + 1]
            img.data[o + 2] = src[i * 3 + 2]
          }
          img.data[o + 3] = 255
        }
        ctx.putImageData(img, 0, 0)
        frames.push({ id: uid('fr'), index: f, url: canvas.toDataURL('image/png'), width: columns, height: rows, pixelSpacing })
        continue
      }
      const data =
        bitsAllocated === 8
          ? new Uint8Array(buf)
          : pixelRep === 1
            ? new Int16Array(buf)
            : new Uint16Array(buf)
      let wc = ds.floatString('x00281050')
      let ww = ds.floatString('x00281051')
      if (wc === undefined || ww === undefined || ww <= 0) [wc, ww] = autoWindow(data, slope, intercept)
      const raw: DicomPixels = {
        data,
        rows,
        columns,
        slope,
        intercept,
        windowCenter: wc,
        windowWidth: ww,
        invert: photometric === 'MONOCHROME1',
      }
      frames.push({ id: uid('fr'), index: f, url: pixelsToDataUrl(raw), width: columns, height: rows, pixelSpacing, raw })
    }
  } else if (ts === TS_EXPLICIT_BE || ts === TS_DEFLATED) {
    throw new Error('Sintaxe de transferência DICOM não suportada (big-endian/deflated). Exporte como "Explicit VR Little Endian".')
  } else {
    throw new Error(`Compressão DICOM não suportada no navegador (${ts}). Exporte sem compressão ou JPEG baseline, ou converta para PNG.`)
  }

  return {
    frames,
    modality: mapModality(meta.Modality),
    region: mapBodyPart(meta.BodyPartExamined),
    meta,
    removedTags,
    burnedInAnnotation: burnedIn,
    warnings,
  }
}

export function isDicomFile(file: File, head: Uint8Array): boolean {
  if (/\.dcm$|\.dicom$/i.test(file.name) || file.type === 'application/dicom') return true
  // "DICM" magic at offset 128
  return head.length >= 132 && head[128] === 0x44 && head[129] === 0x49 && head[130] === 0x43 && head[131] === 0x4d
}
