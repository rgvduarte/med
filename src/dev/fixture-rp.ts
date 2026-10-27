// Dev-only fixture (loaded only with ?fixture=1): analysed cases that exercise the worklist,
// evidence panel and report (draft, in review, validated). Images are drawn on a canvas at
// runtime — schematic, not real patient data.
import type { AnalysisResult, Case, EvidenceItem, Finding, Frame, NotebookLmAnswer, Report, Series, StageState } from '../types'
import { reportContentHash } from '../lib/report/hash'
import { buildAiDeclaration } from '../lib/report/format'

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  return [c, ctx]
}

function bone(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, shade = 205) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0)
  g.addColorStop(0, `rgb(${shade - 70},${shade - 70},${shade - 70})`)
  g.addColorStop(0.18, `rgb(${shade},${shade},${shade})`)
  g.addColorStop(0.5, `rgb(${shade - 45},${shade - 45},${shade - 45})`)
  g.addColorStop(0.82, `rgb(${shade},${shade},${shade})`)
  g.addColorStop(1, `rgb(${shade - 70},${shade - 70},${shade - 70})`)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number, shade = 190) {
  const g = ctx.createRadialGradient(x, y, 2, x, y, Math.max(rx, ry))
  g.addColorStop(0, `rgb(${shade - 40},${shade - 40},${shade - 40})`)
  g.addColorStop(0.8, `rgb(${shade},${shade},${shade})`)
  g.addColorStop(1, `rgb(${shade - 60},${shade - 60},${shade - 60})`)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
  ctx.fill()
}

function softTissue(ctx: CanvasRenderingContext2D, w: number, h: number, path: () => void) {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgb(48,48,48)'
  ctx.beginPath()
  path()
  ctx.fill()
}

function marker(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = 'bold 26px sans-serif'
  ctx.fillText(text, x, y)
}

function frame(url: string, w: number, h: number, index: number, timeSec?: number): Frame {
  return { id: `rp-fr-${Math.random().toString(36).slice(2, 9)}`, index, url, width: w, height: h, timeSec }
}

function wristPA(): Frame {
  const W = 512
  const H = 640
  const [c, ctx] = canvas(W, H)
  softTissue(ctx, W, H, () => {
    ctx.moveTo(150, H)
    ctx.bezierCurveTo(140, 420, 110, 300, 120, 170)
    ctx.lineTo(160, 0)
    ctx.lineTo(380, 0)
    ctx.lineTo(400, 170)
    ctx.bezierCurveTo(410, 300, 380, 420, 365, H)
  })
  // metacarpals
  ;[170, 215, 258, 300, 338].forEach((x, i) => bone(ctx, x - 14 + i * 2, 20 + (i === 0 ? 70 : 0), 28, i === 0 ? 120 : 150, 12, 200))
  // carpals
  ellipse(ctx, 205, 270, 30, 22, 0.2)
  ellipse(ctx, 255, 262, 26, 22, 0)
  ellipse(ctx, 300, 258, 24, 20, 0)
  ellipse(ctx, 335, 280, 22, 24, 0)
  ellipse(ctx, 215, 318, 34, 20, -0.6, 196) // scaphoid
  ellipse(ctx, 268, 322, 26, 20, 0)
  ellipse(ctx, 315, 325, 22, 20, 0)
  // radius + ulna
  bone(ctx, 175, 360, 120, 290, 26, 212)
  bone(ctx, 315, 375, 62, 280, 20, 205)
  // distal radius fracture line
  ctx.strokeStyle = 'rgb(35,35,35)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(178, 405)
  ctx.lineTo(220, 414)
  ctx.lineTo(250, 409)
  ctx.lineTo(292, 418)
  ctx.stroke()
  // subtle scaphoid waist lucency
  ctx.strokeStyle = 'rgba(40,40,40,0.75)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(206, 305)
  ctx.lineTo(224, 330)
  ctx.stroke()
  marker(ctx, 'E', W - 50, 44)
  return frame(c.toDataURL('image/jpeg', 0.85), W, H, 0)
}

function wristLateral(): Frame {
  const W = 512
  const H = 640
  const [c, ctx] = canvas(W, H)
  softTissue(ctx, W, H, () => {
    ctx.moveTo(180, H)
    ctx.bezierCurveTo(170, 420, 160, 260, 190, 0)
    ctx.lineTo(330, 0)
    ctx.bezierCurveTo(350, 260, 345, 420, 335, H)
  })
  bone(ctx, 222, 10, 64, 190, 22, 200)
  ellipse(ctx, 255, 250, 44, 34, 0.1, 200)
  ellipse(ctx, 252, 310, 38, 28, -0.1, 195)
  ctx.save()
  ctx.translate(255, 360)
  ctx.rotate(-0.12)
  bone(ctx, -52, 0, 104, 300, 26, 214)
  ctx.restore()
  ctx.strokeStyle = 'rgb(35,35,35)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(206, 410)
  ctx.lineTo(240, 402)
  ctx.lineTo(300, 396)
  ctx.stroke()
  marker(ctx, 'E', W - 50, 44)
  return frame(c.toDataURL('image/jpeg', 0.85), W, H, 0)
}

function kneeAP(): Frame {
  const W = 512
  const H = 640
  const [c, ctx] = canvas(W, H)
  softTissue(ctx, W, H, () => {
    ctx.moveTo(110, 0)
    ctx.bezierCurveTo(80, 300, 90, 420, 130, H)
    ctx.lineTo(390, H)
    ctx.bezierCurveTo(430, 420, 440, 300, 410, 0)
  })
  bone(ctx, 175, 0, 170, 270, 30, 210)
  ellipse(ctx, 205, 285, 58, 34, 0, 214)
  ellipse(ctx, 315, 285, 58, 34, 0, 214)
  bone(ctx, 160, 335, 200, 70, 18, 212)
  bone(ctx, 195, 395, 130, 260, 22, 210)
  bone(ctx, 360, 360, 34, 280, 14, 196)
  marker(ctx, 'D', 30, 44)
  return frame(c.toDataURL('image/jpeg', 0.85), W, H, 0)
}

function ankleAP(): Frame {
  const W = 512
  const H = 640
  const [c, ctx] = canvas(W, H)
  softTissue(ctx, W, H, () => {
    ctx.moveTo(140, 0)
    ctx.bezierCurveTo(120, 300, 110, 480, 130, H)
    ctx.lineTo(390, H)
    ctx.bezierCurveTo(410, 480, 400, 300, 380, 0)
  })
  bone(ctx, 185, 0, 130, 380, 24, 210)
  bone(ctx, 330, 0, 40, 430, 14, 198)
  ellipse(ctx, 255, 440, 80, 46, 0, 214)
  ellipse(ctx, 255, 540, 100, 60, 0, 196)
  marker(ctx, 'D', 30, 44)
  return frame(c.toDataURL('image/jpeg', 0.85), W, H, 0)
}

/** Ultrasound-like frames: speckle, a bright cortical line and a tendon band that drifts over time. */
function usFrames(n: number): Frame[] {
  const W = 480
  const H = 360
  const frames: Frame[] = []
  let seed = 7
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let i = 0; i < n; i++) {
    const [c, ctx] = canvas(W, H)
    const img = ctx.createImageData(W, H)
    const shift = i * 6
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const fan = Math.abs(x - W / 2) < W / 2 - y * 0.18 ? 1 : 0
        const depth = 1 - y / H
        const tendon = Math.abs(y - (120 + Math.sin((x + shift) / 70) * 10)) < 26 ? 0.55 : 0
        const cortex = Math.abs(y - (215 + Math.sin((x + shift) / 90) * 14)) < 4 ? 1 : 0
        const shadow = y > 220 + Math.sin((x + shift) / 90) * 14 ? 0.15 : 1
        const lesion = Math.hypot(x - (250 + shift * 0.6), y - 110) < 18 && i >= 2 && i <= 5 ? -0.45 : 0
        let v = (0.18 + tendon + lesion) * (0.55 + rnd() * 0.9) * depth * shadow + cortex * 0.95
        v = Math.max(0, Math.min(1, v)) * fan
        const o = (y * W + x) * 4
        img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(v * 255)
        img.data[o + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    frames.push(frame(c.toDataURL('image/jpeg', 0.8), W, H, i, Math.round(i * 0.6 * 10) / 10))
  }
  return frames
}

function iso(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60000).toISOString()
}

function stagesDone(start: string): StageState[] {
  const ids = ['preprocess', 'triage', 'findings', 'evidence', 'report', 'verify'] as const
  let t = new Date(start).getTime()
  return ids.map((id, i) => {
    const s = new Date(t).toISOString()
    t += [400, 5200, 14800, 9100, 11300, 4200][i]
    return { id, status: 'done', startedAt: s, finishedAt: new Date(t).toISOString() }
  })
}

const KUO: EvidenceItem = {
  id: 'kuo2022',
  source: 'kb',
  title: 'Artificial intelligence in fracture detection: a systematic review and meta-analysis',
  citation: 'Kuo RYL, Harrison C, Curran TA, et al. Radiology. 2022;304(1):50–62.',
  doi: '10.1148/radiol.211785',
  pmid: '35348381',
  year: 2022,
  evidenceType: 'systematic-review-meta-analysis',
  points: ['Nos estudos incluídos, o desempenho da IA na deteção de fraturas foi semelhante ao dos clínicos, com elevado risco de viés e poucos estudos de validação externa.'],
  findingIds: ['rp-w-f1'],
}

const GUERMAZI: EvidenceItem = {
  id: 'guermazi2022',
  source: 'kb',
  title: 'Improving radiographic fracture recognition performance and efficiency using artificial intelligence',
  citation: 'Guermazi A, Tannoury C, Kompel AJ, et al. Radiology. 2022;302(3):627–636.',
  doi: '10.1148/radiol.210937',
  year: 2022,
  evidenceType: 'diagnostic-accuracy',
  points: ['A assistência por IA aumentou a sensibilidade dos leitores na deteção de fraturas e reduziu o tempo de leitura por exame.'],
  findingIds: ['rp-w-f1', 'rp-w-f2'],
}

const MALLEE: EvidenceItem = {
  id: 'mallee2015',
  source: 'kb',
  title: 'Computed tomography versus magnetic resonance imaging versus bone scintigraphy for clinically suspected scaphoid fractures in patients with negative plain radiographs',
  citation: 'Mallee WH, Wang J, Poolman RW, et al. Cochrane Database Syst Rev. 2015;(6):CD010023.',
  doi: '10.1002/14651858.CD010023.pub2',
  year: 2015,
  evidenceType: 'systematic review (Cochrane)',
  points: ['Na suspeita clínica de fratura do escafoide com radiografias iniciais negativas, a TC e a RM são alternativas de segunda linha com especificidade elevada.'],
  findingIds: ['rp-w-f2'],
}

const NOTES: EvidenceItem = {
  id: 'notas-punho',
  source: 'kb',
  title: 'Apontamentos de serviço — radiografia do punho',
  citation: 'Documento interno, sem identificador bibliográfico.',
  evidenceType: 'book chapter',
  points: ['A artrose trapeziometacárpica é um achado incidental frequente em adultos com mais de 50 anos.'],
  findingIds: ['rp-w-f3'],
}

const NLM_ITEM: EvidenceItem = {
  id: 'NLM-1',
  source: 'notebooklm',
  title: 'Caderno «MSK-Trauma» — fontes citadas na resposta',
  citation: 'NotebookLM, caderno «MSK-Trauma»: Kuo et al. 2022; Mallee et al. 2015.',
  points: ['Com radiografias iniciais negativas e suspeita clínica persistente de fratura do escafoide, as fontes do caderno indicam RM ou TC, ou repetição da radiografia.'],
  findingIds: ['rp-w-f2'],
}

const NLM_ANSWER: NotebookLmAnswer = {
  question:
    'For a wrist radiograph (PA and lateral) showing a distal radius metaphyseal fracture and a possible scaphoid waist fracture, summarize diagnostic criteria, classification and recommended follow-up imaging. Use only the sources and cite them.',
  answer:
    'As fontes do caderno descrevem a fratura do rádio distal como uma descontinuidade cortical metafisária, por vezes com angulação dorsal do fragmento distal [1]. Para a suspeita de fratura do escafoide com radiografias inconclusivas, recomendam imagiologia adicional (RM ou TC) ou repetição da radiografia, porque as fraturas da cintura podem não ser visíveis inicialmente [2].',
  sources: [
    'Kuo RYL et al. 2022 – Artificial intelligence in fracture detection. Radiology. doi:10.1148/radiol.211785',
    'Mallee WH et al. 2015 – CT vs MRI vs bone scintigraphy for suspected scaphoid fractures. Cochrane. doi:10.1002/14651858.CD010023.pub2',
  ],
  findingIds: ['rp-w-f1', 'rp-w-f2'],
}

function finding(p: Partial<Finding> & Pick<Finding, 'id' | 'cls' | 'group' | 'label'>): Finding {
  return {
    origin: 'ai',
    description: '',
    anatomicSite: '',
    laterality: 'left',
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

async function wristCase(): Promise<Case> {
  const pa: Series = { id: 'rp-w-s1', kind: 'image', modality: 'XR', region: 'wrist-hand', description: 'Punho E — PA', view: 'PA', laterality: 'left', frames: [wristPA()] }
  const lat: Series = { id: 'rp-w-s2', kind: 'image', modality: 'XR', region: 'wrist-hand', description: 'Punho E — Perfil', view: 'Perfil', laterality: 'left', frames: [wristLateral()] }
  const start = iso(6)
  const findings: Finding[] = [
    finding({
      id: 'rp-w-f1',
      cls: 'positive',
      group: 'priority',
      label: 'Fratura da metáfise distal do rádio',
      description: 'Traço de fratura transverso extra-articular na metáfise distal do rádio, com ligeira angulação dorsal do fragmento distal.',
      anatomicSite: 'Rádio distal, metáfise',
      certainty: 'consistent-with',
      severity: 'significant',
      confidence: 'high',
      classification: { system: 'AO/OTA', grade: '2R3A2', rationale: 'Fratura extra-articular simples do rádio distal.' },
      locations: [
        { seriesId: 'rp-w-s1', frameIndex: 0, bbox: [0.33, 0.6, 0.27, 0.08] },
        { seriesId: 'rp-w-s2', frameIndex: 0, bbox: [0.38, 0.59, 0.24, 0.07] },
      ],
      evidenceQuery: ['distal radius fracture radiograph'],
      evidenceIds: ['kuo2022', 'guermazi2022'],
    }),
    finding({
      id: 'rp-w-f2',
      cls: 'doubtful',
      group: 'priority',
      label: 'Possível fratura da cintura do escafoide',
      description: 'Ténue linha radiotransparente na cintura do escafoide, sem desvio. Pode corresponder a sobreposição.',
      anatomicSite: 'Escafoide, cintura',
      certainty: 'possible',
      severity: 'significant',
      confidence: 'low',
      locations: [{ seriesId: 'rp-w-s1', frameIndex: 0, bbox: [0.36, 0.46, 0.13, 0.08] }],
      evidenceQuery: ['occult scaphoid fracture imaging'],
      evidenceIds: ['mallee2015', 'NLM-1'],
    }),
    finding({
      id: 'rp-w-f3',
      cls: 'positive',
      group: 'other',
      label: 'Artrose trapeziometacárpica ligeira',
      description: 'Redução ligeira da interlinha trapeziometacárpica com pequeno osteófito.',
      anatomicSite: 'Articulação trapeziometacárpica',
      certainty: 'consistent-with',
      severity: 'minor',
      confidence: 'moderate',
      locations: [{ seriesId: 'rp-w-s1', frameIndex: 0, bbox: [0.3, 0.3, 0.1, 0.08] }],
      evidenceIds: ['notas-punho'],
      status: 'accepted',
    }),
    finding({ id: 'rp-w-f4', cls: 'negative', group: 'checklist', label: 'Luxação radiocárpica ou intercárpica', severity: 'normal', certainty: 'unlikely', locations: [{ seriesId: 'rp-w-s1', frameIndex: 0 }] }),
    finding({ id: 'rp-w-f5', cls: 'negative', group: 'checklist', label: 'Lesão óssea agressiva', severity: 'normal', certainty: 'unlikely', locations: [{ seriesId: 'rp-w-s1', frameIndex: 0 }] }),
    finding({ id: 'rp-w-f6', cls: 'negative', group: 'checklist', label: 'Corpo estranho radiopaco', severity: 'normal', certainty: 'unlikely', locations: [{ seriesId: 'rp-w-s2', frameIndex: 0 }] }),
  ]
  const analysis: AnalysisResult = {
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    language: 'pt-PT',
    startedAt: start,
    finishedAt: iso(5),
    stages: stagesDone(start),
    triage: {
      modality: 'XR',
      region: 'wrist-hand',
      view: 'PA + perfil',
      laterality: 'left',
      imageQuality: 'adequate',
      qualityNotes: 'Incidências adequadas; ligeira rotação no perfil.',
      skeletalMaturity: 'adult',
      hardwarePresent: false,
      summary: 'Radiografia do punho esquerdo em duas incidências.',
    },
    findings,
    evidence: [KUO, GUERMAZI, MALLEE, NOTES, NLM_ITEM],
    notebookLm: [NLM_ANSWER],
    verification: {
      passed: false,
      issues: [{ severity: 'warning', section: 'Conclusão', message: 'O item 2 mantém «possível»: confirme se o grau de certeza corresponde às imagens.' }],
    },
    totalUsage: { inputTokens: 18400, outputTokens: 3900 },
  }
  const report: Report = {
    language: 'pt-PT',
    clinicalIndication: 'Queda sobre a mão em extensão. Dor na tabaqueira anatómica. Excluir fratura.',
    technique: 'Radiografia do punho esquerdo, incidências PA e perfil (2 imagens). Análise assistida por IA: Claude Opus 5.5, 2 imagens analisadas.',
    comparison: 'Sem exames prévios disponíveis para comparação.',
    findingsByRegion: [
      { heading: 'Alinhamento', text: 'Ligeira angulação dorsal do fragmento distal do rádio [F1]. Sem luxação radiocárpica ou intercárpica.' },
      { heading: 'Osso', text: 'Traço de fratura transverso na metáfise distal do rádio, extra-articular [F1][kuo2022]. Possível descontinuidade cortical na cintura do escafoide [F2][mallee2015].' },
      { heading: 'Articulações', text: 'Redução ligeira da interlinha trapeziometacárpica com pequeno osteófito [F3].' },
      { heading: 'Partes moles', text: 'Tumefação das partes moles dorsais do punho.' },
    ],
    impression: [
      'Fratura extra-articular da metáfise distal do rádio esquerdo, com ligeira angulação dorsal [F1][kuo2022].',
      'Possível fratura da cintura do escafoide, sem desvio; não é possível excluir [F2][mallee2015].',
      'Artrose trapeziometacárpica ligeira [F3].',
    ],
    recommendations: ['Se persistir suspeita clínica de fratura do escafoide, considerar RM ou TC, ou repetir a radiografia em 10–14 dias [mallee2015][NLM-1].'],
    limitations: 'Sugestões geradas por IA: a localização é aproximada e a confiança é declarada pelo modelo, não calibrada [guermazi2022].',
    citations: [
      { evidenceId: 'kuo2022', statement: 'Desempenho da IA na deteção de fraturas.' },
      { evidenceId: 'mallee2015', statement: 'Imagiologia de segunda linha na suspeita de fratura do escafoide.' },
    ],
    status: 'draft',
    generatedBy: 'Claude Opus 5.5 (claude-opus-5-5)',
    generatedAt: iso(5),
    editedByClinician: false,
    reviewedSections: [],
  }
  return {
    id: 'rp-fx-wrist',
    pseudoId: 'MSK-0042',
    title: 'Radiografia punho e mão',
    createdAt: iso(7),
    ageYears: 58,
    sex: 'F',
    indication: report.clinicalIndication,
    priority: 'urgent',
    status: 'analysed',
    series: [pa, lat],
    analysis,
    report,
    audit: [
      { at: iso(7), actor: 'system', action: 'Caso criado', detail: '2 série(s) carregada(s) localmente (fixture)' },
      { at: start, actor: 'ai', action: 'Análise iniciada', detail: 'claude-opus-5-5' },
      { at: iso(5), actor: 'ai', action: 'Análise concluída', detail: '3 achados · 5 referências' },
      { at: iso(4), actor: 'user', action: 'Achado aceite', detail: 'Artrose trapeziometacárpica ligeira' },
    ],
  }
}

async function shoulderUsCase(): Promise<Case> {
  const frames = usFrames(8)
  const s: Series = {
    id: 'rp-u-s1',
    kind: 'video',
    modality: 'US',
    region: 'shoulder',
    description: 'Ombro D — supraespinhoso, eixo longo (clip)',
    laterality: 'right',
    frames,
    durationSec: 4.8,
  }
  const start = iso(60 * 26)
  const roy: EvidenceItem = {
    id: 'roy2015',
    source: 'kb',
    title: 'Diagnostic accuracy of ultrasonography, MRI and MR arthrography in the characterisation of rotator cuff disorders: a systematic review and meta-analysis',
    citation: 'Roy JS, Braën C, Leblond J, et al. Br J Sports Med. 2015;49(20):1316–1328.',
    doi: '10.1136/bjsports-2014-094148',
    year: 2015,
    evidenceType: 'systematic review and meta-analysis',
    points: ['A ecografia tem exatidão comparável à RM na caracterização de roturas da coifa dos rotadores, com menor sensibilidade nas roturas parciais.'],
    findingIds: ['rp-u-f1'],
  }
  const findings: Finding[] = [
    finding({
      id: 'rp-u-f1',
      cls: 'doubtful',
      group: 'priority',
      label: 'Possível rotura parcial da face bursal do supraespinhoso',
      description: 'Área hipoecogénica focal na face bursal do tendão, visível em vários fotogramas, sem descontinuidade de espessura total.',
      anatomicSite: 'Tendão do supraespinhoso',
      laterality: 'right',
      certainty: 'possible',
      severity: 'significant',
      confidence: 'moderate',
      locations: [{ seriesId: 'rp-u-s1', frameIndex: 3, bbox: [0.5, 0.24, 0.12, 0.14] }],
      frameRange: [2, 5],
      evidenceIds: ['roy2015'],
    }),
    finding({ id: 'rp-u-f2', cls: 'negative', group: 'checklist', label: 'Derrame da bursa subacromiodeltoideia', laterality: 'right', severity: 'normal', certainty: 'unlikely', locations: [{ seriesId: 'rp-u-s1', frameIndex: 0 }] }),
    finding({ id: 'rp-u-f3', cls: 'negative', group: 'checklist', label: 'Rotura de espessura total', laterality: 'right', severity: 'normal', certainty: 'less-likely', locations: [{ seriesId: 'rp-u-s1', frameIndex: 4 }] }),
  ]
  const report: Report = {
    language: 'pt-PT',
    clinicalIndication: 'Dor no ombro direito com a abdução há 3 meses. Avaliar coifa dos rotadores.',
    technique: 'Ecografia do ombro direito, clip de 4,8 s (8 fotogramas-chave analisados). Análise assistida por IA: Claude Opus 5.5.',
    comparison: 'Sem exames prévios disponíveis para comparação.',
    findingsByRegion: [
      { heading: 'Supraespinhoso', text: 'Área hipoecogénica focal na face bursal, sem rotura de espessura total [F1][roy2015].' },
      { heading: 'Bursa', text: 'Sem derrame na bursa subacromiodeltoideia.' },
    ],
    impression: ['Possível rotura parcial da face bursal do supraespinhoso direito [F1][roy2015].', 'Sem rotura de espessura total.'],
    recommendations: [],
    limitations: 'Avaliação dinâmica limitada a 8 fotogramas-chave.',
    citations: [{ evidenceId: 'roy2015', statement: 'Exatidão da ecografia na coifa dos rotadores.' }],
    status: 'draft',
    generatedBy: 'Claude Opus 5.5 (claude-opus-5-5)',
    generatedAt: iso(60 * 25),
    editedByClinician: true,
    reviewedSections: ['indication', 'technique'],
  }
  return {
    id: 'rp-fx-shoulder-us',
    pseudoId: 'MSK-0041',
    title: 'Ecografia ombro',
    createdAt: iso(60 * 26 + 5),
    ageYears: 47,
    sex: 'M',
    indication: report.clinicalIndication,
    priority: 'routine',
    status: 'analysed',
    series: [s],
    analysis: {
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      language: 'pt-PT',
      startedAt: start,
      finishedAt: iso(60 * 25),
      stages: stagesDone(start),
      findings,
      evidence: [roy],
      notebookLm: [],
    },
    report,
    audit: [
      { at: iso(60 * 26 + 5), actor: 'system', action: 'Caso criado', detail: '1 série(s) carregada(s) localmente (fixture)' },
      { at: iso(60 * 25), actor: 'ai', action: 'Análise concluída', detail: '1 achado' },
      { at: iso(60 * 24), actor: 'user', action: 'Relatório editado', detail: 'Indicação clínica' },
    ],
  }
}

async function kneeValidatedCase(): Promise<Case> {
  const s: Series = { id: 'rp-k-s1', kind: 'image', modality: 'XR', region: 'knee', description: 'Joelho D — AP', view: 'AP', laterality: 'right', frames: [kneeAP()] }
  const start = iso(60 * 50)
  const findings: Finding[] = [
    finding({ id: 'rp-k-f1', cls: 'negative', group: 'checklist', label: 'Fratura', laterality: 'right', severity: 'normal', certainty: 'unlikely', status: 'accepted', locations: [{ seriesId: 'rp-k-s1', frameIndex: 0 }] }),
    finding({ id: 'rp-k-f2', cls: 'negative', group: 'checklist', label: 'Derrame articular', laterality: 'right', severity: 'normal', certainty: 'unlikely', status: 'accepted', locations: [{ seriesId: 'rp-k-s1', frameIndex: 0 }] }),
  ]
  const base: Report = {
    language: 'pt-PT',
    clinicalIndication: 'Traumatismo direto do joelho direito. Excluir fratura.',
    technique: 'Radiografia do joelho direito, incidência AP (1 imagem). Análise assistida por IA: Claude Opus 5.5.',
    comparison: 'Sem exames prévios disponíveis para comparação.',
    findingsByRegion: [
      { heading: 'Osso', text: 'Sem traço de fratura identificado.' },
      { heading: 'Articulações', text: 'Interlinhas articulares conservadas.' },
      { heading: 'Partes moles', text: 'Sem derrame articular evidente.' },
    ],
    impression: ['Sem evidência radiográfica de fratura.'],
    recommendations: [],
    limitations: 'Apenas uma incidência disponível.',
    citations: [],
    status: 'validated',
    generatedBy: 'Claude Opus 5.5 (claude-opus-5-5)',
    generatedAt: iso(60 * 49),
    editedByClinician: false,
    reviewedSections: ['indication', 'technique', 'comparison', 'findings', 'impression', 'limitations'],
    validatedBy: 'Utilizador de demonstração',
    validatedAt: iso(60 * 47),
  }
  const c: Case = {
    id: 'rp-fx-knee',
    pseudoId: 'MSK-0039',
    title: 'Radiografia joelho',
    createdAt: iso(60 * 50 + 5),
    ageYears: 34,
    sex: 'M',
    indication: base.clinicalIndication,
    priority: 'routine',
    status: 'validated',
    series: [s],
    analysis: { provider: 'anthropic', model: 'claude-opus-5-5', language: 'pt-PT', startedAt: start, finishedAt: iso(60 * 49), stages: stagesDone(start), findings, evidence: [], notebookLm: [] },
    audit: [],
  }
  const withDecl: Report = { ...base, aiDeclaration: buildAiDeclaration(c, base) }
  const report: Report = { ...withDecl, contentHash: await reportContentHash(withDecl) }
  return {
    ...c,
    report,
    audit: [
      { at: iso(60 * 50 + 5), actor: 'system', action: 'Caso criado', detail: '1 série(s) (fixture)' },
      { at: iso(60 * 49), actor: 'ai', action: 'Análise concluída', detail: 'Sem achados' },
      { at: iso(60 * 47), actor: 'user', action: 'Relatório validado', detail: 'Utilizador de demonstração' },
    ],
  }
}

function ankleNewCase(): Case {
  return {
    id: 'rp-fx-ankle',
    pseudoId: 'MSK-0043',
    title: 'Radiografia tornozelo',
    createdAt: iso(30),
    ageYears: 22,
    sex: 'F',
    indication: 'Entorse em inversão durante jogo de basquetebol. Dor no maléolo lateral.',
    priority: 'routine',
    status: 'new',
    series: [{ id: 'rp-a-s1', kind: 'image', modality: 'XR', region: 'ankle-foot', description: 'Tornozelo D — AP', view: 'AP', laterality: 'right', frames: [ankleAP()] }],
    audit: [{ at: iso(30), actor: 'system', action: 'Caso criado', detail: '1 série(s) (fixture)' }],
  }
}

export async function buildRpFixture(): Promise<Case[]> {
  return [await wristCase(), await shoulderUsCase(), await kneeValidatedCase(), ankleNewCase()]
}
