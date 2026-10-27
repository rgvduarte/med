// Dev-only fixture for the case workspace (loaded only with «?fixture=1» in the URL).
// Images are drawn at runtime on a canvas — synthetic, no real patient data, no downloads.
import type { AnalysisResult, AuditEntry, Case, EvidenceItem, Finding, Frame, Report, StageState } from '../types'
import { useCases } from '../store/cases'

const T0 = Date.parse('2026-10-27T21:05:00Z')
const iso = (offsetSec: number) => new Date(T0 + offsetSec * 1000).toISOString()

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d', { willReadFrequently: true })!]
}

/** Small deterministic PRNG so every load draws the same images. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function addGrain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number) {
  const r = rng(seed)
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() + r() - 1) * amount
    const v = Math.max(0, Math.min(255, d[i] + n))
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
}

type Pt = [number, number]

function shape(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  }
  ctx.closePath()
}

function bone(ctx: CanvasRenderingContext2D, draw: () => void, density = 0.5) {
  ctx.save()
  draw()
  ctx.fillStyle = `rgba(205,205,205,${density})`
  ctx.fill()
  ctx.lineWidth = 7
  ctx.strokeStyle = 'rgba(240,240,240,0.55)'
  ctx.stroke()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = 'rgba(250,250,250,0.85)'
  ctx.stroke()
  ctx.restore()
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  return () => {
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
  }
}

function longBone(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number) {
  const ang = Math.atan2(y1 - y0, x1 - x0)
  const nx = Math.cos(ang + Math.PI / 2)
  const ny = Math.sin(ang + Math.PI / 2)
  return () =>
    shape(ctx, [
      [x0 + nx * w0, y0 + ny * w0],
      [x0 - nx * w0 * 0.2, y0 - ny * w0 * 0.2 + (y1 < y0 ? 8 : -8)],
      [x0 - nx * w0, y0 - ny * w0],
      [(x0 + x1) / 2 - nx * w0 * 0.55, (y0 + y1) / 2 - ny * w0 * 0.55],
      [x1 - nx * w1, y1 - ny * w1],
      [x1, y1 + (y1 < y0 ? -10 : 10)],
      [x1 + nx * w1, y1 + ny * w1],
      [(x0 + x1) / 2 + nx * w0 * 0.55, (y0 + y1) / 2 + ny * w0 * 0.55],
    ])
}

function softTissue(ctx: CanvasRenderingContext2D, w: number, h: number, pts: Pt[]) {
  const g = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, Math.max(w, h) * 0.75)
  g.addColorStop(0, '#141414')
  g.addColorStop(1, '#050505')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.save()
  ctx.filter = 'blur(14px)'
  shape(ctx, pts)
  ctx.fillStyle = 'rgba(70,70,70,0.75)'
  ctx.fill()
  ctx.restore()
}

function marker(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.save()
  ctx.font = '700 34px Arial, sans-serif'
  ctx.fillStyle = 'rgba(245,245,245,0.92)'
  ctx.fillText(text, x, y)
  ctx.strokeStyle = 'rgba(245,245,245,0.7)'
  ctx.lineWidth = 2
  ctx.strokeRect(x - 7, y - 32, 36, 40)
  ctx.restore()
}

// Geometry of the synthetic PA view (720×900); boxes below are derived from it.
const PA = { w: 720, h: 900 }
const PA_FRACTURE: [number, number, number, number] = [372 / PA.w, 588 / PA.h, 236 / PA.w, 54 / PA.h]
const PA_SCAPHOID: [number, number, number, number] = [488 / PA.w, 470 / PA.h, 70 / PA.w, 56 / PA.h]
const PA_CMC: [number, number, number, number] = [548 / PA.w, 400 / PA.h, 60 / PA.w, 50 / PA.h]
const LAT = { w: 720, h: 900 }
const LAT_FRACTURE: [number, number, number, number] = [312 / LAT.w, 566 / LAT.h, 150 / LAT.w, 70 / LAT.h]

function drawWristPA(): string {
  const [c, ctx] = makeCanvas(PA.w, PA.h)
  softTissue(ctx, PA.w, PA.h, [
    [170, 900],
    [190, 600],
    [160, 420],
    [150, 120],
    [210, 0],
    [610, 0],
    [700, 230],
    [640, 420],
    [620, 600],
    [600, 900],
  ])
  ctx.save()
  ctx.filter = 'blur(1.2px)'
  // Forearm
  bone(ctx, longBone(ctx, 268, 905, 262, 600, 44, 40), 0.42) // ulna
  bone(ctx, () =>
    shape(ctx, [
      [415, 905],
      [405, 760],
      [385, 640],
      [372, 590],
      [395, 556],
      [470, 545],
      [560, 552],
      [612, 575],
      [598, 640],
      [560, 760],
      [548, 905],
    ]),
    0.5,
  )
  bone(ctx, ellipse(ctx, 262, 588, 26, 20), 0.5) // ulnar head
  // Carpus — proximal row
  bone(ctx, ellipse(ctx, 522, 498, 36, 24, -0.6), 0.55) // scaphoid
  bone(ctx, ellipse(ctx, 440, 505, 34, 28), 0.55) // lunate
  bone(ctx, ellipse(ctx, 362, 500, 30, 24, 0.3), 0.55) // triquetrum
  bone(ctx, ellipse(ctx, 338, 470, 18, 16), 0.45) // pisiform
  // Carpus — distal row
  bone(ctx, ellipse(ctx, 568, 438, 30, 24, -0.4), 0.55) // trapezium
  bone(ctx, ellipse(ctx, 510, 430, 24, 22), 0.55) // trapezoid
  bone(ctx, ellipse(ctx, 448, 440, 30, 38), 0.6) // capitate
  bone(ctx, ellipse(ctx, 380, 440, 30, 32, 0.2), 0.55) // hamate
  // Metacarpals
  bone(ctx, longBone(ctx, 590, 415, 668, 250, 20, 15), 0.5) // thumb
  bone(ctx, longBone(ctx, 512, 405, 536, 120, 18, 14), 0.5)
  bone(ctx, longBone(ctx, 452, 398, 450, 100, 19, 14), 0.5)
  bone(ctx, longBone(ctx, 396, 405, 372, 130, 17, 13), 0.5)
  bone(ctx, longBone(ctx, 350, 420, 300, 175, 16, 12), 0.5)
  // Proximal phalanges (cropped)
  bone(ctx, longBone(ctx, 676, 228, 700, 120, 13, 11), 0.45)
  bone(ctx, longBone(ctx, 540, 92, 548, -40, 14, 12), 0.45)
  bone(ctx, longBone(ctx, 450, 72, 450, -40, 14, 12), 0.45)
  bone(ctx, longBone(ctx, 368, 102, 352, -30, 13, 11), 0.45)
  bone(ctx, longBone(ctx, 294, 150, 262, 20, 12, 10), 0.45)
  ctx.restore()

  // Distal radius fracture: dark irregular transverse line + small dorsal cortical step.
  ctx.save()
  ctx.strokeStyle = 'rgba(20,20,20,0.85)'
  ctx.lineWidth = 3.5
  ctx.beginPath()
  const pts: Pt[] = [
    [380, 618],
    [410, 608],
    [436, 616],
    [470, 604],
    [500, 612],
    [532, 600],
    [566, 608],
    [600, 598],
  ]
  ctx.moveTo(...pts[0])
  for (const p of pts.slice(1)) ctx.lineTo(...p)
  ctx.stroke()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = 'rgba(250,250,250,0.6)'
  ctx.beginPath()
  ctx.moveTo(382, 626)
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y + 8)
  ctx.stroke()
  // Faint lucent line across the scaphoid waist.
  ctx.strokeStyle = 'rgba(30,30,30,0.45)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(505, 515)
  ctx.lineTo(522, 498)
  ctx.lineTo(540, 482)
  ctx.stroke()
  // Trapeziometacarpal osteophyte and joint-space narrowing.
  ctx.fillStyle = 'rgba(235,235,235,0.75)'
  ctx.beginPath()
  ctx.moveTo(586, 420)
  ctx.lineTo(600, 410)
  ctx.lineTo(594, 426)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  marker(ctx, 'L', 40, 70)
  addGrain(ctx, PA.w, PA.h, 16, 7)
  return c.toDataURL('image/jpeg', 0.86)
}

function drawWristLateral(): string {
  const [c, ctx] = makeCanvas(LAT.w, LAT.h)
  softTissue(ctx, LAT.w, LAT.h, [
    [250, 900],
    [255, 600],
    [240, 420],
    [270, 0],
    [520, 0],
    [520, 420],
    [505, 600],
    [520, 900],
  ])
  ctx.save()
  ctx.filter = 'blur(1.2px)'
  bone(ctx, longBone(ctx, 372, 905, 372, 600, 46, 42), 0.45) // ulna superimposed
  bone(ctx, () =>
    shape(ctx, [
      [330, 905],
      [322, 720],
      [314, 610],
      [318, 570],
      [380, 552],
      [452, 566],
      [462, 620],
      [445, 720],
      [440, 905],
    ]),
    0.5,
  )
  bone(ctx, ellipse(ctx, 388, 520, 44, 30, 0.25), 0.55) // lunate
  bone(ctx, ellipse(ctx, 392, 450, 40, 46), 0.6) // capitate
  bone(ctx, ellipse(ctx, 430, 470, 30, 40, -0.3), 0.45) // scaphoid / trapezium overlap
  bone(ctx, longBone(ctx, 396, 405, 410, 90, 30, 22), 0.6) // metacarpals superimposed
  bone(ctx, longBone(ctx, 448, 430, 520, 260, 18, 14), 0.5) // thumb ray
  ctx.restore()
  // Dorsally angulated fracture with a dorsal cortical step.
  ctx.save()
  ctx.strokeStyle = 'rgba(20,20,20,0.85)'
  ctx.lineWidth = 3.5
  ctx.beginPath()
  ctx.moveTo(320, 596)
  ctx.lineTo(352, 604)
  ctx.lineTo(392, 594)
  ctx.lineTo(430, 608)
  ctx.lineTo(456, 600)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(245,245,245,0.75)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(316, 600)
  ctx.lineTo(306, 612)
  ctx.stroke()
  ctx.restore()
  marker(ctx, 'L', 40, 70)
  addGrain(ctx, LAT.w, LAT.h, 16, 11)
  return c.toDataURL('image/jpeg', 0.86)
}

// Ultrasound: long-axis supraspinatus, 8 key frames with a slow probe sweep.
const US = { w: 640, h: 480, frames: 8 }
const usOffset = (i: number) => (i - 3.5) * 9
const tendonTop = (x: number) => 205 + 0.00045 * (x - 320) ** 2
const TEAR_X = 318
function usTearBox(i: number): [number, number, number, number] {
  const x = TEAR_X + usOffset(i)
  const top = tendonTop(x)
  return [(x - 34) / US.w, (top - 12) / US.h, 68 / US.w, 44 / US.h]
}
function usBursaBox(i: number): [number, number, number, number] {
  const x0 = 220 + usOffset(i)
  return [x0 / US.w, (tendonTop(x0) - 18) / US.h, 200 / US.w, 26 / US.h]
}

function drawUsFrame(i: number): string {
  const [c, ctx] = makeCanvas(US.w, US.h)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, US.w, US.h)
  // Render the echo map at half resolution, then upscale: the interpolation gives speckle-like grain.
  const sw = US.w / 2
  const sh = US.h / 2
  const [small, sctx] = makeCanvas(sw, sh)
  const img = sctx.createImageData(sw, sh)
  const r = rng(101 + i * 13)
  const off = usOffset(i)
  const tear = i >= 2 && i <= 5
  const bursa = i <= 2
  for (let py = 0; py < sh; py++) {
    for (let px = 0; px < sw; px++) {
      const x = px * 2
      const y = py * 2
      let e = 0
      if (x >= 60 && x <= 580 && y >= 30 && y <= 450) {
        const ax = x - off
        const tt = tendonTop(ax)
        const cortex = tt + 62
        if (y < 40) e = 0.8
        else if (y < 80) e = 0.22 + (Math.abs(((ax * 0.08 + y * 0.9) % 23) - 11) < 1.2 ? 0.35 : 0)
        else if (y < tt - 12) e = 0.3 + (Math.abs(((ax * 0.35 + y) % 17) - 8) < 1.4 ? 0.28 : 0)
        else if (y < tt - 6) e = 0.75
        else if (y < tt) e = bursa ? 0.05 : 0.12
        else if (y < cortex - 8) {
          e = 0.58 + (Math.abs(((y - tt) % 5) - 2.5) < 0.9 ? 0.18 : 0)
          if (tear) {
            const dx = (ax - TEAR_X) / 30
            const dy = (y - tt) / 26
            if (dx * dx + dy * dy < 1 + 0.25 * Math.sin(ax * 0.4)) e = 0.07
          }
        } else if (y < cortex - 3) e = 0.06
        else if (y < cortex + 3) e = 1
        else e = 0.03
        e *= 1 - (0.35 * (y - 30)) / 420
      }
      const speckle = 0.35 + 1.3 * r() * r()
      const v = Math.max(0, Math.min(255, e * speckle * 255))
      const k = (py * sw + px) * 4
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v
      img.data[k + 3] = 255
    }
  }
  sctx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(small, 0, 0, US.w, US.h)
  // Depth scale ticks (1 cm ≈ 70 px) — not identifying.
  ctx.fillStyle = 'rgba(230,230,230,0.8)'
  for (let y = 30; y <= 450; y += 35) ctx.fillRect(596, y, y % 70 === 30 ? 10 : 5, 2)
  ctx.font = '600 13px Arial, sans-serif'
  ctx.fillText('SSP LAX', 64, 22)
  return c.toDataURL('image/jpeg', 0.85)
}

// ---------------------------------------------------------------------------

function stagesDone(start: number, msgs: Partial<Record<StageState['id'], string>>): StageState[] {
  const plan: [StageState['id'], number, number, number][] = [
    ['preprocess', 0.8, 0, 0],
    ['triage', 4.2, 3900, 260],
    ['findings', 17.6, 8200, 1900],
    ['evidence', 6.1, 2100, 640],
    ['report', 7.4, 6400, 1500],
    ['verify', 1.9, 3800, 180],
  ]
  let t = start
  return plan.map(([id, dur, inTok, outTok]) => {
    const s: StageState = {
      id,
      status: 'done',
      startedAt: iso(t),
      finishedAt: iso(t + dur),
      message: msgs[id],
      usage: inTok ? { inputTokens: inTok, outputTokens: outTok } : undefined,
    }
    t += dur
    return s
  })
}

function base(f: Partial<Finding> & Pick<Finding, 'id' | 'cls' | 'group' | 'label'>): Finding {
  return {
    origin: 'ai',
    description: '',
    anatomicSite: '',
    laterality: 'left',
    certainty: 'possible',
    severity: 'normal',
    confidence: 'moderate',
    locations: [],
    evidenceQuery: [],
    evidenceIds: [],
    status: 'pending',
    ...f,
  }
}

function wristCase(): Case {
  const s1: Frame = { id: 'fx-w-s1-f0', index: 0, url: drawWristPA(), width: PA.w, height: PA.h, pixelSpacing: [0.14, 0.14] }
  const s2: Frame = { id: 'fx-w-s2-f0', index: 0, url: drawWristLateral(), width: LAT.w, height: LAT.h, pixelSpacing: [0.14, 0.14] }
  const findings: Finding[] = [
    base({
      id: 'w-f1',
      cls: 'positive',
      group: 'priority',
      label: 'Fratura do rádio distal',
      description: 'Traço de fratura metafisário distal do rádio, extra-articular, com ligeira angulação dorsal no perfil.',
      anatomicSite: 'Rádio distal (metáfise)',
      certainty: 'consistent-with',
      severity: 'significant',
      confidence: 'high',
      classification: { system: 'AO/OTA', grade: '2R3A2', rationale: 'Extra-articular, metafisária simples, sem cominução aparente.' },
      locations: [
        { seriesId: 'fx-w-s1', frameIndex: 0, bbox: PA_FRACTURE },
        { seriesId: 'fx-w-s2', frameIndex: 0, bbox: LAT_FRACTURE },
      ],
      evidenceQuery: ['distal radius fracture radiograph AI detection'],
      evidenceIds: ['kuo2022'],
    }),
    base({
      id: 'w-f2',
      cls: 'doubtful',
      group: 'priority',
      label: 'Possível fratura do escafoide',
      description: 'Ténue linha radiotransparente na cintura do escafoide, sem desvio; pode corresponder a sobreposição.',
      anatomicSite: 'Escafoide (cintura)',
      certainty: 'possible',
      severity: 'significant',
      confidence: 'low',
      locations: [{ seriesId: 'fx-w-s1', frameIndex: 0, bbox: PA_SCAPHOID }],
      evidenceQuery: ['occult scaphoid fracture imaging'],
      evidenceIds: ['acr-wrist', 'mallee2015', 'NLM-1'],
    }),
    base({
      id: 'w-f3',
      cls: 'doubtful',
      group: 'other',
      label: 'Artrose trapeziometacárpica ligeira',
      description: 'Redução ligeira da entrelinha trapeziometacárpica com pequeno osteófito marginal.',
      anatomicSite: 'Articulação trapeziometacárpica',
      certainty: 'suspicious-for',
      severity: 'minor',
      confidence: 'moderate',
      locations: [{ seriesId: 'fx-w-s1', frameIndex: 0, bbox: PA_CMC }],
    }),
    base({ id: 'w-c1', cls: 'negative', group: 'checklist', label: 'Luxação do carpo', confidence: 'high', certainty: 'unlikely' }),
    base({ id: 'w-c2', cls: 'negative', group: 'checklist', label: 'Fratura do cúbito distal', confidence: 'moderate', certainty: 'unlikely' }),
    base({ id: 'w-c3', cls: 'negative', group: 'checklist', label: 'Corpo estranho radiopaco', confidence: 'high', certainty: 'unlikely' }),
  ]
  const evidence: EvidenceItem[] = [
    {
      id: 'kuo2022',
      source: 'kb',
      title: 'Artificial intelligence in fracture detection: a systematic review and meta-analysis',
      citation: 'Kuo RYL, Harrison C, Curran TA, et al. Radiology. 2022;304(1):50–62.',
      year: 2022,
      evidenceType: 'Revisão sistemática',
      points: ['Em estudos de validação, o desempenho agregado da IA na deteção de fraturas foi comparável ao dos clínicos, com elevada heterogeneidade entre estudos.'],
      findingIds: ['w-f1'],
    },
    {
      id: 'acr-wrist',
      source: 'kb',
      title: 'ACR Appropriateness Criteria® Acute Hand and Wrist Trauma',
      citation: 'Torabi M, Lenchik L, Beaman FD, et al. J Am Coll Radiol. 2019;16(5S):S7–S17.',
      year: 2019,
      evidenceType: 'Guideline/Consenso',
      points: ['Com suspeita clínica de fratura do escafoide e radiografia inicial negativa ou duvidosa, a RM é o exame seguinte habitualmente apropriado; em alternativa, repetir a radiografia em 10–14 dias.'],
      findingIds: ['w-f2'],
    },
    {
      id: 'mallee2015',
      source: 'kb',
      title: 'CT versus MRI versus bone scintigraphy for clinically suspected scaphoid fractures in patients with negative plain radiographs',
      citation: 'Mallee WH, Wang J, Poolman RW, et al. Cochrane Database Syst Rev. 2015;(6):CD010023.',
      year: 2015,
      evidenceType: 'Revisão sistemática',
      points: ['RM e TC apresentam elevada exatidão diagnóstica para fratura oculta do escafoide; a especificidade da TC foi ligeiramente superior.'],
      findingIds: ['w-f2'],
    },
    {
      id: 'NLM-1',
      source: 'notebooklm',
      title: 'Síntese NotebookLM — fratura oculta do escafoide',
      citation: 'Caderno «MSK-Trauma» (NotebookLM)',
      points: ['Perante dor na tabaqueira anatómica com radiografia duvidosa, imobilizar e obter RM ou repetir radiografia em 10–14 dias.'],
      findingIds: ['w-f2'],
    },
  ]
  const report: Report = {
    language: 'pt-PT',
    clinicalIndication: 'Queda sobre a mão em extensão. Dor na tabaqueira anatómica. Excluir fratura.',
    technique: 'Radiografia do punho esquerdo, incidências PA e perfil (2 imagens). Análise assistida por IA (claude-opus-5-5), 2 imagens analisadas.',
    comparison: 'Sem exames prévios disponíveis para comparação.',
    findingsByRegion: [
      {
        heading: 'Osso',
        text: 'Traço de fratura metafisário distal do rádio, extra-articular, com ligeira angulação dorsal no perfil [kuo2022]. Ténue linha radiotransparente na cintura do escafoide, sem desvio, de significado indeterminado [acr-wrist].',
      },
      { heading: 'Articulações', text: 'Redução ligeira da entrelinha trapeziometacárpica com pequeno osteófito marginal. Alinhamento radiocárpico e intercárpico preservado.' },
      { heading: 'Partes moles', text: 'Tumefação das partes moles dorsais do punho.' },
    ],
    impression: [
      'Fratura metafisária distal do rádio esquerdo, extra-articular, com ligeira angulação dorsal.',
      'Possível fratura da cintura do escafoide — não excluída radiograficamente [acr-wrist][mallee2015].',
    ],
    recommendations: ['Se persistir suspeita clínica de fratura do escafoide, considerar RM ou repetir radiografia em 10–14 dias [acr-wrist][mallee2015].'],
    limitations: 'Localização dos achados aproximada; confiança declarada pelo modelo, não calibrada. Rascunho para revisão clínica.',
    citations: [
      { evidenceId: 'kuo2022', statement: 'Desempenho da IA na deteção de fraturas.' },
      { evidenceId: 'acr-wrist', statement: 'Conduta perante suspeita de fratura do escafoide.' },
      { evidenceId: 'mallee2015', statement: 'Exatidão de TC e RM na fratura oculta do escafoide.' },
    ],
    status: 'draft',
    generatedBy: 'claude-opus-5-5',
    generatedAt: iso(38),
    editedByClinician: false,
  }
  const analysis: AnalysisResult = {
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    language: 'pt-PT',
    startedAt: iso(0),
    finishedAt: iso(38),
    stages: stagesDone(0, {
      preprocess: '2 imagens · redimensionadas a 1568 px',
      triage: 'RX punho E · PA e perfil · qualidade adequada',
      findings: '3 achados · 3 verificações negativas',
      evidence: '3 referências da base curada · 1 síntese NotebookLM',
      report: 'Rascunho com 3 referências',
      verify: 'Lateralidade, citações e dados pessoais verificados',
    }),
    triage: {
      modality: 'XR',
      region: 'wrist-hand',
      view: 'PA e perfil',
      laterality: 'left',
      imageQuality: 'adequate',
      qualityNotes: '',
      skeletalMaturity: 'adult',
      hardwarePresent: false,
      summary: 'Radiografia do punho esquerdo em duas incidências, adulto, sem material de osteossíntese.',
    },
    findings,
    evidence,
    notebookLm: [
      {
        question: 'Que exames considerar perante suspeita clínica de fratura do escafoide com radiografia inicial duvidosa?',
        answer:
          'As fontes do caderno recomendam imobilização e RM como exame seguinte quando disponível; em alternativa, repetir a radiografia em 10–14 dias. A TC é uma opção quando a RM está contraindicada.',
        sources: ['ACR Appropriateness Criteria — Acute Hand and Wrist Trauma (2019)', 'Mallee et al., Cochrane 2015'],
        findingIds: ['w-f2'],
      },
    ],
    verification: {
      passed: true,
      issues: [
        { severity: 'info', section: 'Lateralidade', message: 'Lateralidade consistente (esquerda) entre pedido, imagem e texto.' },
        { severity: 'warning', section: 'Conclusão', message: 'O achado «Possível fratura do escafoide» tem confiança baixa: confirme antes de incluir.' },
      ],
    },
    totalUsage: { inputTokens: 24400, outputTokens: 4480, cacheReadTokens: 6100 },
  }
  const audit: AuditEntry[] = [
    { at: iso(-120), actor: 'system', action: 'Caso criado', detail: '2 séries carregadas localmente (fixture de desenvolvimento)' },
    { at: iso(0), actor: 'user', action: 'Análise pedida' },
    { at: iso(38), actor: 'ai', action: 'Análise concluída', detail: 'claude-opus-5-5 · 3 achados · 3 referências' },
  ]
  return {
    id: 'fx-ws-wrist',
    pseudoId: 'MSK-0042',
    title: 'Punho esquerdo — queda sobre a mão',
    createdAt: iso(-120),
    ageYears: 47,
    sex: 'F',
    indication: 'Queda sobre a mão em extensão. Dor na tabaqueira anatómica. Excluir fratura.',
    priority: 'urgent',
    status: 'analysed',
    isDemo: true,
    series: [
      { id: 'fx-w-s1', kind: 'image', modality: 'XR', region: 'wrist-hand', description: 'Punho PA', view: 'PA', laterality: 'left', frames: [s1] },
      { id: 'fx-w-s2', kind: 'image', modality: 'XR', region: 'wrist-hand', description: 'Punho perfil', view: 'Perfil', laterality: 'left', frames: [s2] },
    ],
    analysis,
    report,
    audit,
  }
}

function shoulderCase(): Case {
  const frames: Frame[] = Array.from({ length: US.frames }, (_, i) => ({
    id: `fx-u-f${i}`,
    index: i,
    timeSec: i * 1.5,
    url: drawUsFrame(i),
    width: US.w,
    height: US.h,
  }))
  const sid = 'fx-u-s1'
  const findings: Finding[] = [
    base({
      id: 'u-f1',
      cls: 'doubtful',
      group: 'priority',
      label: 'Possível rotura parcial da face bursal do supraespinhoso',
      description: 'Área hipoecogénica focal na face bursal do tendão supraespinhoso, sem extensão à face articular e sem retração.',
      anatomicSite: 'Tendão supraespinhoso (zona crítica)',
      laterality: 'right',
      certainty: 'possible',
      severity: 'significant',
      confidence: 'moderate',
      frameRange: [2, 5],
      locations: [
        { seriesId: sid, frameIndex: 3, bbox: usTearBox(3) },
        { seriesId: sid, frameIndex: 4, bbox: usTearBox(4) },
      ],
      evidenceIds: ['roy2015'],
    }),
    base({
      id: 'u-f2',
      cls: 'positive',
      group: 'other',
      label: 'Espessamento da bursa subacromiodeltoideia',
      description: 'Bursa com espessamento hipoecogénico de cerca de 2 mm sobre o supraespinhoso.',
      anatomicSite: 'Bursa subacromiodeltoideia',
      laterality: 'right',
      certainty: 'consistent-with',
      severity: 'minor',
      confidence: 'high',
      frameRange: [0, 2],
      locations: [{ seriesId: sid, frameIndex: 1, bbox: usBursaBox(1) }],
    }),
    base({ id: 'u-c1', cls: 'negative', group: 'checklist', label: 'Rotura transfixiva do supraespinhoso', laterality: 'right', confidence: 'high' }),
    base({ id: 'u-c2', cls: 'negative', group: 'checklist', label: 'Calcificação intratendinosa', laterality: 'right', confidence: 'high' }),
  ]
  const evidence: EvidenceItem[] = [
    {
      id: 'roy2015',
      source: 'kb',
      title: 'Diagnostic accuracy of ultrasonography, MRI and MR arthrography in the characterisation of rotator cuff disorders',
      citation: 'Roy JS, Braën C, Leblond J, et al. Br J Sports Med. 2015;49(20):1316–1328.',
      year: 2015,
      evidenceType: 'Revisão sistemática',
      points: ['A ecografia tem exatidão semelhante à RM para roturas transfixivas; o desempenho é menor nas roturas parciais.'],
      findingIds: ['u-f1'],
    },
  ]
  return {
    id: 'fx-ws-shoulder',
    pseudoId: 'MSK-0043',
    title: 'Ombro direito — dor na abdução',
    createdAt: iso(-3600),
    ageYears: 58,
    sex: 'M',
    indication: 'Dor no ombro direito com arco doloroso. Avaliar coifa dos rotadores.',
    priority: 'routine',
    status: 'analysed',
    isDemo: true,
    series: [
      {
        id: sid,
        kind: 'video',
        modality: 'US',
        region: 'shoulder',
        description: 'Supraespinhoso, eixo longo',
        view: 'Eixo longo',
        laterality: 'right',
        frames,
        durationSec: 12,
      },
    ],
    analysis: {
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      language: 'pt-PT',
      startedAt: iso(-3500),
      finishedAt: iso(-3458),
      stages: stagesDone(-3500, {
        preprocess: '8 de 360 fotogramas selecionados · máscara aplicada',
        triage: 'Ecografia do ombro D · eixo longo do supraespinhoso',
        findings: '2 achados · 2 verificações negativas',
        evidence: '1 referência da base curada · NotebookLM indisponível',
        report: 'Rascunho com 1 referência',
        verify: 'Sem problemas',
      }),
      triage: {
        modality: 'US',
        region: 'shoulder',
        view: 'Supraespinhoso, eixo longo',
        laterality: 'right',
        imageQuality: 'limited',
        qualityNotes: 'Apenas um plano disponível; avaliação dinâmica não incluída.',
        skeletalMaturity: 'adult',
        hardwarePresent: false,
        summary: 'Ecografia do ombro direito, eixo longo do supraespinhoso, 8 fotogramas-chave.',
      },
      findings,
      evidence,
      notebookLm: [],
      verification: { passed: true, issues: [] },
      totalUsage: { inputTokens: 31800, outputTokens: 3900 },
    },
    audit: [
      { at: iso(-3600), actor: 'system', action: 'Caso criado', detail: '1 vídeo · 8 fotogramas-chave (fixture de desenvolvimento)' },
      { at: iso(-3458), actor: 'ai', action: 'Análise concluída', detail: 'claude-opus-5-5 · 2 achados' },
    ],
  }
}

function pendingCases(wrist: Case): Case[] {
  const series = wrist.series.map((s) => ({ ...s, id: `${s.id}-n`, frames: s.frames.map((f) => ({ ...f, id: `${f.id}-n` })) }))
  const fresh: Case = {
    id: 'fx-ws-new',
    pseudoId: 'MSK-0044',
    title: 'Punho esquerdo — sem análise',
    createdAt: iso(600),
    ageYears: 33,
    sex: 'M',
    indication: 'Entorse do punho em queda de bicicleta. Excluir fratura.',
    priority: 'routine',
    status: 'new',
    isDemo: true,
    series,
    audit: [{ at: iso(600), actor: 'system', action: 'Caso criado', detail: '2 séries carregadas localmente (fixture de desenvolvimento)' }],
  }
  const now = Date.now()
  const running: Case = {
    ...fresh,
    id: 'fx-ws-running',
    pseudoId: 'MSK-0045',
    title: 'Punho esquerdo — análise em curso',
    series: wrist.series.map((s) => ({ ...s, id: `${s.id}-r`, frames: s.frames.map((f) => ({ ...f, id: `${f.id}-r` })) })),
    status: 'analysing',
    analysis: {
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      language: 'pt-PT',
      startedAt: new Date(now - 9000).toISOString(),
      stages: [
        { id: 'preprocess', status: 'done', startedAt: new Date(now - 9000).toISOString(), finishedAt: new Date(now - 8200).toISOString(), message: '2 imagens · redimensionadas' },
        {
          id: 'triage',
          status: 'done',
          startedAt: new Date(now - 8200).toISOString(),
          finishedAt: new Date(now - 4100).toISOString(),
          message: 'RX punho E · qualidade adequada',
          usage: { inputTokens: 3900, outputTokens: 240 },
        },
        { id: 'findings', status: 'running', startedAt: new Date(now - 4100).toISOString(), message: 'Imagem 2/2 …' },
        { id: 'evidence', status: 'pending' },
        { id: 'report', status: 'pending' },
        { id: 'verify', status: 'pending' },
      ],
      findings: [],
      evidence: [],
      notebookLm: [],
    },
  }
  return [fresh, running]
}

export function buildWsFixtureCases(): Case[] {
  const wrist = wristCase()
  return [wrist, shoulderCase(), ...pendingCases(wrist)]
}

let loaded = false

/** Idempotent: upsertCases skips ids that already exist. */
export function loadWsFixture() {
  if (loaded || typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('fixture')) return
  if (new URLSearchParams(window.location.search).get('fixture') !== '1') return
  loaded = true
  useCases.getState().upsertCases(buildWsFixtureCases())
}
