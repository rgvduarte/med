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

// Attributes considered safe to display. Only Modality, BodyPartExamined, ViewPosition, laterality and
// the cleaned SeriesDescription reach the model (see caseContext in the VLM pipeline).
const SAFE_TAGS: Record<string, string> = {
  x00080060: 'Modality',
  x00180015: 'BodyPartExamined',
  x00185101: 'ViewPosition',
  x00200062: 'ImageLaterality',
  x00200060: 'Laterality',
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

// SeriesDescription (0008,103E) is free text (PS3.15 Table E.1-1: "X", kept only under the Clean
// Descriptors option) and sometimes carries names or record numbers. Only acquisition and anatomy
// descriptors from this list survive; everything else is dropped.
const DESCRIPTOR_TOKENS = new Set(
  (
    'PA AP LAT LATERAL OBL OBLIQ OBLIQUE OBLIQUA AX AXIAL COR CORONAL SAG SAGITTAL TRA TRANS TRANSVERSE LONG LONGITUDINAL ' +
    'DP DORSAL PLANTAR VOLAR PALMAR AXILLARY AXILAR STANDING WB STRESS FLEX FLEXION EXT EXTENSION FROG SKYLINE SUNRISE MERCHANT ' +
    'MORTISE TUNNEL NOTCH INLET OUTLET JUDET SCAPHOID ESCAFOIDE ULNAR RADIAL DEVIATION ' +
    'T1 T2 PD STIR FS FAT SAT FATSAT DIXON WATER GRE TSE FSE SE SPIR SPAIR FLAIR DWI ADC MEDIC MERGE SWI T1W T2W PDW ' +
    '2D 3D MPR MIP VR SCOUT LOCALIZER SURVEY BONE SOFT TISSUE STD POST PRE GD C+ CONTRAST ' +
    'LEFT RIGHT L R ESQ ESQUERDO ESQUERDA DTO DIR DIREITO DIREITA BILAT BILATERAL ' +
    'WRIST HAND FINGER THUMB ELBOW FOREARM SHOULDER HUMERUS CLAVICLE HIP PELVIS FEMUR KNEE PATELLA LEG TIBIA FIBULA ANKLE FOOT TOE HEEL CALCANEUS ' +
    'SPINE CSPINE TSPINE LSPINE CERVICAL THORACIC LUMBAR SACRUM ' +
    'PUNHO MAO DEDO POLEGAR COTOVELO ANTEBRACO OMBRO UMERO CLAVICULA ANCA BACIA JOELHO ROTULA PERNA PERONEO ' +
    'TORNOZELO PE CALCANEO COLUNA LOMBAR TORACICA'
  ).split(' '),
)

/** Keeps only known acquisition/anatomy descriptors from a free-text SeriesDescription (at most 6). */
export function cleanSeriesDescription(raw: string | undefined): string {
  if (!raw) return ''
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9+]+/)
    .filter((t) => DESCRIPTOR_TOKENS.has(t))
    .slice(0, 6)
    .join(' ')
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
  /** BurnedInAnnotation (0028,0301); undefined when the tag is absent or has another value. */
  burnedInAnnotation?: 'YES' | 'NO'
  warnings: string[]
  /**
   * SeriesInstanceUID, used only to group one-file-per-image exports into a single series during
   * ingest. It is PHI: never copy it into a Series, the meta or the audit trail.
   */
  groupKey?: string
  /** InstanceNumber (0020,0013), for ordering the images of one series. */
  instanceNumber?: number
  /** ImagePositionPatient projected on the slice normal (mm), the fallback ordering key. */
  slicePosition?: number
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

async function decodeJpegFrame(bytes: Uint8Array, invert: boolean): Promise<string> {
  const copy = new Uint8Array(bytes)
  const blob = new Blob([copy.buffer], { type: 'image/jpeg' })
  const bmp = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bmp, 0, 0)
  if (invert) {
    // MONOCHROME1: low values are white. Show it like MONOCHROME2, as the uncompressed path does.
    const img = ctx.getImageData(0, 0, bmp.width, bmp.height)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i]
      d[i + 1] = 255 - d[i + 1]
      d[i + 2] = 255 - d[i + 2]
    }
    ctx.putImageData(img, 0, 0)
  }
  return canvas.toDataURL('image/png')
}

/**
 * Keeps only the BitsStored bits that end at HighBit (overlay bits or garbage above them are
 * dropped) and sign-extends signed data. `raw` is the pixel data read as unsigned words.
 */
export function storedPixelValues(raw: Uint8Array | Uint16Array, bitsStored: number, highBit: number, signed: boolean): Uint8Array | Uint16Array | Int16Array {
  const allocated = raw.BYTES_PER_ELEMENT * 8
  const stored = bitsStored > 0 && bitsStored <= allocated ? bitsStored : allocated
  const shift = highBit + 1 >= stored && highBit < allocated ? highBit + 1 - stored : 0
  if (!signed && shift === 0 && stored === allocated) return raw
  if (signed && shift === 0 && stored === 16 && allocated === 16) return new Int16Array(raw.buffer, raw.byteOffset, raw.length)
  const mask = (1 << stored) - 1
  const ext = 32 - stored
  const out = signed ? new Int16Array(raw.length) : allocated === 8 ? new Uint8Array(raw.length) : new Uint16Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    const v = (raw[i] >>> shift) & mask
    out[i] = signed ? (v << ext) >> ext : v
  }
  return out
}

/** YBR_FULL (ITU-R BT.601, full range) → RGB, written to an RGBA buffer at offset o (the array clamps and rounds). */
export function writeYbrFull(out: Uint8ClampedArray, o: number, y: number, cb: number, cr: number) {
  out[o] = y + 1.402 * (cr - 128)
  out[o + 1] = y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128)
  out[o + 2] = y + 1.772 * (cb - 128)
  out[o + 3] = 255
}

/** `count` frame numbers spread evenly over 0..n-1 (all of them when count ≥ n). */
export function sampleFrameIndices(n: number, count: number): number[] {
  if (count >= n) return Array.from({ length: n }, (_, i) => i)
  if (count <= 1) return [0]
  return Array.from({ length: count }, (_, k) => Math.round((k * (n - 1)) / (count - 1)))
}

/** Seconds between frames: FrameTime (0018,1063, ms), else CineRate (0018,0040), else RecommendedDisplayFrameRate (0008,2144). */
function frameIntervalSec(ds: dicomParser.DataSet): number | undefined {
  const ft = ds.floatString('x00181063')
  if (ft !== undefined && ft > 0) return ft / 1000
  for (const tag of ['x00180040', 'x00082144']) {
    const rate = ds.floatString(tag)
    if (rate !== undefined && rate > 0) return 1 / rate
  }
  return undefined
}

function numbers(v: string | undefined): number[] | undefined {
  return v ? v.split('\\').map(Number) : undefined
}

function parseSpacing(v: string | undefined): [number, number] | undefined {
  const n = numbers(v)
  return n && n.length === 2 && n.every((x) => Number.isFinite(x) && x > 0) ? [n[0], n[1]] : undefined
}

/** ImagePositionPatient projected on the normal of ImageOrientationPatient (mm along the stack). */
export function slicePosition(ipp: number[] | undefined, iop: number[] | undefined): number | undefined {
  if (!ipp || !iop || ipp.length !== 3 || iop.length !== 6 || ![...ipp, ...iop].every(Number.isFinite)) return undefined
  const [r0, r1, r2, c0, c1, c2] = iop
  const nx = r1 * c2 - r2 * c1
  const ny = r2 * c0 - r0 * c2
  const nz = r0 * c1 - r1 * c0
  return ipp[0] * nx + ipp[1] * ny + ipp[2] * nz
}

/**
 * Parses a DICOM Part 10 file in the browser, de-identifies it (only whitelisted,
 * non-identifying attributes are retained) and renders each frame to 8-bit.
 * Supported: uncompressed little-endian (implicit/explicit) and JPEG baseline; MONOCHROME1/2,
 * RGB and YBR_FULL. Longer multi-frame files are sampled evenly down to maxFrames.
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
  // Rows/Columns are US (binary) attributes: reading them as strings yields junk characters.
  const US_TAGS = new Set(['x00280010', 'x00280011'])
  for (const [tag, name] of Object.entries(SAFE_TAGS)) {
    const v = US_TAGS.has(tag) ? ds.uint16(tag)?.toString() : ds.string(tag)
    if (v) meta[name] = v
  }
  const description = cleanSeriesDescription(ds.string('x0008103e'))
  if (description) meta.SeriesDescription = description

  const warnings: string[] = []
  const burnedRaw = (ds.string('x00280301') ?? '').trim().toUpperCase()
  const burnedInAnnotation = burnedRaw === 'YES' || burnedRaw === 'NO' ? burnedRaw : undefined
  if (burnedInAnnotation === 'YES') warnings.push('O ficheiro indica anotações gravadas na imagem (BurnedInAnnotation=YES): podem existir dados identificáveis nos píxeis.')

  const ts = ds.string('x00020010') ?? TS_IMPLICIT_LE
  const rows = ds.uint16('x00280010') ?? 0
  const columns = ds.uint16('x00280011') ?? 0
  const bitsAllocated = ds.uint16('x00280100') ?? 16
  const bitsStored = ds.uint16('x00280101') ?? bitsAllocated
  const highBit = ds.uint16('x00280102') ?? bitsStored - 1
  const pixelRep = ds.uint16('x00280103') ?? 0
  const samples = ds.uint16('x00280002') ?? 1
  const photometric = (ds.string('x00280004') ?? 'MONOCHROME2').trim().toUpperCase()
  const nFrames = Math.max(1, ds.intString('x00280008') ?? 1)
  const slope = ds.floatString('x00281053') ?? 1
  const intercept = ds.floatString('x00281052') ?? 0

  // PixelSpacing is in the patient plane. ImagerPixelSpacing is at the detector, where the anatomy is
  // magnified (about 1.02-1.10 for a hand on the detector, more for thicker parts): correct it with
  // EstimatedRadiographicMagnificationFactor when present, otherwise label it as detector spacing.
  let pixelSpacing = parseSpacing(ds.string('x00280030'))
  let pixelSpacingSource: Frame['pixelSpacingSource'] = pixelSpacing ? 'patient' : undefined
  const imagerSpacing = pixelSpacing ? undefined : parseSpacing(ds.string('x00181164'))
  if (imagerSpacing) {
    const mag = ds.floatString('x00181114')
    if (mag !== undefined && mag >= 1 && mag < 3) {
      pixelSpacing = [imagerSpacing[0] / mag, imagerSpacing[1] / mag]
      pixelSpacingSource = 'patient'
    } else {
      pixelSpacing = imagerSpacing
      pixelSpacingSource = 'detector'
    }
  }

  const pixelEl = ds.elements['x7fe00010']
  if (!pixelEl) throw new Error('O ficheiro DICOM não contém dados de imagem (PixelData).')
  if (!rows || !columns) throw new Error('Dimensões da imagem DICOM em falta.')
  const monochrome = photometric === 'MONOCHROME1' || photometric === 'MONOCHROME2'
  if (!monochrome && photometric !== 'RGB' && !photometric.startsWith('YBR_')) {
    throw new Error(`Interpretação fotométrica não suportada (${photometric}). Exporte como MONOCHROME2 ou RGB, ou converta para PNG.`)
  }

  const frames: Frame[] = []
  const picks = sampleFrameIndices(nFrames, maxFrames)
  if (nFrames > maxFrames) warnings.push(`Carregadas ${maxFrames} de ${nFrames} imagens, distribuídas uniformemente pela sequência.`)
  const dt = nFrames > 1 ? frameIntervalSec(ds) : undefined
  const frameBase = (k: number, f: number) => ({
    id: uid('fr'),
    index: k,
    timeSec: dt !== undefined ? f * dt : undefined,
    width: columns,
    height: rows,
    pixelSpacing,
    pixelSpacingSource,
  })

  if (ts === TS_JPEG_BASELINE && pixelEl.encapsulatedPixelData) {
    const offsets = nFrames === 1 ? undefined : dicomParser.createJPEGBasicOffsetTable(ds, pixelEl)
    for (let k = 0; k < picks.length; k++) {
      const f = picks[k]
      const frameBytes = offsets
        ? dicomParser.readEncapsulatedImageFrame(ds, pixelEl, f, offsets)
        : dicomParser.readEncapsulatedPixelDataFromFragments(ds, pixelEl, 0, pixelEl.fragments?.length)
      const url = await decodeJpegFrame(frameBytes as Uint8Array, photometric === 'MONOCHROME1')
      frames.push({ ...frameBase(k, f), url })
    }
  } else if (ts === TS_IMPLICIT_LE || ts === TS_EXPLICIT_LE) {
    if (pixelEl.encapsulatedPixelData) throw new Error('Pixel data encapsulado com sintaxe não comprimida — ficheiro inconsistente.')
    if (bitsAllocated !== 8 && bitsAllocated !== 16) throw new Error(`BitsAllocated ${bitsAllocated} não suportado (apenas 8 ou 16).`)
    if (samples === 3 ? bitsAllocated !== 8 || (photometric !== 'RGB' && photometric !== 'YBR_FULL') : samples !== 1 || !monochrome) {
      throw new Error(`Interpretação fotométrica não suportada sem compressão (${photometric}, ${samples} amostra(s), ${bitsAllocated} bits). Exporte como MONOCHROME2 ou RGB de 8 bits, ou converta para PNG.`)
    }
    const frameSize = rows * columns * samples
    const bytesPer = bitsAllocated / 8
    for (let k = 0; k < picks.length; k++) {
      const f = picks[k]
      const offset = pixelEl.dataOffset + f * frameSize * bytesPer
      const buf = bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + offset + frameSize * bytesPer)
      if (samples === 3) {
        // RGB / YBR_FULL (e.g. ultrasound) — render directly, no windowing.
        const src = new Uint8Array(buf)
        const canvas = document.createElement('canvas')
        canvas.width = columns
        canvas.height = rows
        const ctx = canvas.getContext('2d')!
        const img = ctx.createImageData(columns, rows)
        const planar = ds.uint16('x00280006') === 1
        const ybr = photometric === 'YBR_FULL'
        const n = rows * columns
        for (let i = 0; i < n; i++) {
          const o = i * 4
          const a = planar ? src[i] : src[i * 3]
          const b = planar ? src[i + n] : src[i * 3 + 1]
          const c = planar ? src[i + 2 * n] : src[i * 3 + 2]
          if (ybr) {
            writeYbrFull(img.data, o, a, b, c)
          } else {
            img.data[o] = a
            img.data[o + 1] = b
            img.data[o + 2] = c
            img.data[o + 3] = 255
          }
        }
        ctx.putImageData(img, 0, 0)
        frames.push({ ...frameBase(k, f), url: canvas.toDataURL('image/png') })
        continue
      }
      // Read as unsigned words, then keep BitsStored/HighBit and apply the sign (PixelRepresentation).
      const data = storedPixelValues(bitsAllocated === 8 ? new Uint8Array(buf) : new Uint16Array(buf), bitsStored, highBit, pixelRep === 1)
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
      frames.push({ ...frameBase(k, f), url: pixelsToDataUrl(raw), raw })
    }
  } else if (ts === TS_EXPLICIT_BE || ts === TS_DEFLATED) {
    throw new Error('Sintaxe de transferência DICOM não suportada (big-endian/deflated). Exporte como "Explicit VR Little Endian".')
  } else {
    throw new Error(`Compressão DICOM não suportada no navegador (${ts}). Exporte sem compressão ou JPEG baseline, ou converta para PNG.`)
  }

  const instanceNumber = ds.intString('x00200013')
  return {
    frames,
    modality: mapModality(meta.Modality),
    region: mapBodyPart(meta.BodyPartExamined),
    meta,
    removedTags,
    burnedInAnnotation,
    warnings,
    groupKey: ds.string('x0020000e') || undefined,
    instanceNumber: instanceNumber !== undefined && Number.isFinite(instanceNumber) ? instanceNumber : undefined,
    slicePosition: slicePosition(numbers(ds.string('x00200032')), numbers(ds.string('x00200037'))),
  }
}

export function isDicomFile(file: File, head: Uint8Array): boolean {
  if (/\.dcm$|\.dicom$/i.test(file.name) || file.type === 'application/dicom') return true
  // "DICM" magic at offset 128
  return head.length >= 132 && head[128] === 0x44 && head[129] === 0x49 && head[130] === 0x43 && head[131] === 0x4d
}
