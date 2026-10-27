import type {
  AnalysisResult,
  Case,
  EvidenceItem,
  Finding,
  FindingLocation,
  Report,
  ReportLanguage,
  StageId,
  StageState,
  TokenUsage,
  Triage,
  VerificationIssue,
} from '../../types'
import { useCases } from '../../store/cases'
import { useSettings } from '../../store/settings'
import { encodeFrame } from '../imaging/encode'
import { retrieveEvidence } from '../evidence/kb'
import { queryNotebook } from '../evidence/notebook'
import { MODALITY_LABEL, REGION_LABEL } from '../labels'
import { formatTime, nowIso } from '../util'
import { createProvider, type ContentPart, type VlmProvider } from './providers'
import { FindingsSchema, ReportSchema, TriageSchema, VerifySchema, type FindingsOut, type ReportOut, type TriageOut } from './schemas'
import { PROMPT_VERSION, findingsSystem, reportRevisionSystem, reportSystem, triageSystem, verifySystem } from './prompts'

export const STAGES: StageId[] = ['preprocess', 'triage', 'findings', 'evidence', 'report', 'verify']
const MAX_IMAGES = 20
/** Local CPU models (Ollama in Codespaces, laptops) need far smaller requests to finish in minutes. */
const MAX_IMAGES_LOCAL = 4
const NOTEBOOK_BUDGET_MS = 180_000

export function initialStages(): StageState[] {
  return STAGES.map((id) => ({ id, status: 'pending' }))
}

export interface RunHandle {
  cancel: () => void
  done: Promise<void>
}

export interface ImageRef {
  number: number
  seriesId: string
  frameIndex: number
  /** Size of the image as sent to the model (bounding boxes come back in these pixels). */
  width: number
  height: number
  /** Original picture inside the sent image [x, y, w, h] px; equals [0, 0, width, height] unless letterboxed. */
  content?: [number, number, number, number]
  caption: string
  part: ContentPart
}

const running = new Map<string, RunHandle>()

export function isRunning(caseId: string): boolean {
  return running.has(caseId)
}

class Cancelled extends Error {}

function store() {
  return useCases.getState()
}

function getCase(id: string): Case {
  const c = store().cases.find((x) => x.id === id)
  if (!c) throw new Error('Caso não encontrado.')
  return c
}

function patchAnalysis(caseId: string, fn: (a: AnalysisResult) => Partial<AnalysisResult>) {
  store().updateCase(caseId, (c) => (c.analysis ? { analysis: { ...c.analysis, ...fn(c.analysis) } } : {}))
}

function setStage(caseId: string, id: StageId, patch: Partial<StageState>) {
  patchAnalysis(caseId, (a) => ({ stages: a.stages.map((s) => (s.id === id ? { ...s, ...patch } : s)) }))
}

function addUsage(a: TokenUsage | undefined, b: TokenUsage): TokenUsage {
  return {
    inputTokens: (a?.inputTokens ?? 0) + b.inputTokens,
    outputTokens: (a?.outputTokens ?? 0) + b.outputTokens,
    cacheReadTokens: (a?.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0),
  }
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0))
}

/** Evenly subsamples frames so the request stays within the image budget. */
function pickFrames(c: Case, max: number): { seriesId: string; frameIndex: number }[] {
  const all = c.series.flatMap((s) => s.frames.map((_, i) => ({ seriesId: s.id, frameIndex: i })))
  if (all.length <= max) return all
  if (max === 1) return [all[0]]
  const out: { seriesId: string; frameIndex: number }[] = []
  for (let k = 0; k < max; k++) out.push(all[Math.round((k * (all.length - 1)) / (max - 1))])
  return out
}

async function prepareImages(c: Case, signal: AbortSignal, provider: VlmProvider): Promise<ImageRef[]> {
  const refs: ImageRef[] = []
  const local = provider.local
  const picks = pickFrames(c, provider.scope === 'triage' ? 1 : local ? MAX_IMAGES_LOCAL : MAX_IMAGES)
  for (let i = 0; i < picks.length; i++) {
    if (signal.aborted) throw new Cancelled()
    const p = picks[i]
    const s = c.series.find((x) => x.id === p.seriesId)!
    const f = s.frames[p.frameIndex]
    // MedGemma's vision encoder works at 896 px; larger uploads only cost time on a local model.
    // Claude 4.7+ reads up to 2576 px on the long edge; 2000 px keeps requests with >20 images valid.
    const enc = await encodeFrame(f, provider.scope === 'triage' ? 768 : local ? 896 : 2000, 'image/jpeg', local)
    const where =
      s.frames.length > 1
        ? `, ${s.kind === 'video' ? 'keyframe' : 'frame'} ${p.frameIndex + 1}/${s.frames.length}${f.timeSec !== undefined ? ` at t=${formatTime(f.timeSec)}` : ''}`
        : ''
    refs.push({
      number: i + 1,
      seriesId: s.id,
      frameIndex: p.frameIndex,
      width: enc.width,
      height: enc.height,
      content: enc.content,
      caption: `Image ${i + 1} — series "${s.description}" (${s.modality}${s.view ? `, ${s.view}` : ''})${where}; ${enc.width}×${enc.height} px${
        f.pixelSpacing ? `; pixel spacing ${f.pixelSpacing[0].toFixed(3)} mm` : ''
      }`,
      part: { type: 'image', mediaType: enc.mediaType, base64: enc.base64 },
    })
  }
  return refs
}

function imageParts(images: ImageRef[]): ContentPart[] {
  return images.flatMap((im) => [{ type: 'text', text: im.caption } as ContentPart, im.part])
}

function caseContext(c: Case): string {
  const lines = [
    `Clinical information: ${c.indication || 'not provided'}`,
    `Age: ${c.ageYears ?? 'not provided'}; sex: ${c.sex ?? 'not provided'}; priority: ${c.priority}`,
    `Series: ${c.series.map((s) => `${s.description} (${MODALITY_LABEL[s.modality]}, ${REGION_LABEL[s.region]}, ${s.frames.length} image(s)${s.durationSec ? `, clip ${s.durationSec.toFixed(1)} s` : ''})`).join('; ')}`,
  ]
  const meta = c.series.find((s) => s.dicomMeta)?.dicomMeta
  if (meta) lines.push(`De-identified DICOM attributes: ${JSON.stringify(meta)}`)
  return lines.join('\n')
}

function toTriage(t: TriageOut): Triage {
  return {
    modality: t.modality,
    region: t.region,
    view: t.view,
    laterality: t.laterality,
    imageQuality: t.image_quality,
    qualityNotes: t.quality_notes,
    skeletalMaturity: t.skeletal_maturity,
    hardwarePresent: t.hardware_present,
    summary: t.summary,
  }
}

export function toFindings(out: FindingsOut, images: ImageRef[]): Finding[] {
  const byNumber = new Map(images.map((im) => [im.number, im]))
  const findings: Finding[] = out.findings.map((f, i) => {
    const locations: FindingLocation[] = f.locations
      .map((l) => {
        const im = byNumber.get(l.image_number)
        if (!im) return null
        let bbox: [number, number, number, number] | undefined
        if (l.bbox) {
          // Pixels of the sent image → normalised 0..1 of the original frame (undoing any letterbox).
          const [cx, cy, cw, ch] = im.content ?? [0, 0, im.width, im.height]
          const x = clamp01((l.bbox.x - cx) / cw)
          const y = clamp01((l.bbox.y - cy) / ch)
          const w = Math.min(1 - x, clamp01(l.bbox.w / cw))
          const h = Math.min(1 - y, clamp01(l.bbox.h / ch))
          if (w > 0.005 && h > 0.005) bbox = [x, y, w, h]
        }
        return { seriesId: im.seriesId, frameIndex: im.frameIndex, bbox }
      })
      .filter((l): l is { seriesId: string; frameIndex: number; bbox: [number, number, number, number] | undefined } => l !== null)
    const first = f.frame_range ? byNumber.get(f.frame_range.first_image_number) : undefined
    const last = f.frame_range ? byNumber.get(f.frame_range.last_image_number) : undefined
    const sure = f.certainty === 'consistent-with' && f.confidence === 'high'
    const unlikely = f.certainty === 'less-likely' || f.certainty === 'unlikely'
    return {
      id: `F${i + 1}`,
      origin: 'ai',
      cls: sure ? 'positive' : 'doubtful',
      group: !unlikely && (f.relevant_to_question || f.severity === 'critical') ? 'priority' : 'other',
      label: f.label,
      description: f.description,
      anatomicSite: f.anatomic_site,
      laterality: f.laterality,
      certainty: f.certainty,
      severity: f.severity,
      confidence: f.confidence,
      classification: f.classification ?? undefined,
      locations,
      frameRange: first && last && first.seriesId === last.seriesId ? [first.frameIndex, last.frameIndex] : undefined,
      evidenceQuery: f.evidence_query,
      evidenceIds: [],
      status: 'pending',
    }
  })
  out.checklist
    .filter((c) => c.result !== 'present')
    .forEach((c, i) =>
      findings.push({
        id: `C${i + 1}`,
        origin: 'ai',
        cls: c.result === 'absent' ? 'negative' : 'not-assessable',
        group: 'checklist',
        label: c.item,
        description: '',
        anatomicSite: '',
        laterality: 'none',
        certainty: c.result === 'absent' ? 'unlikely' : 'possible',
        severity: 'normal',
        confidence: 'moderate',
        locations: [],
        evidenceQuery: [],
        evidenceIds: [],
        status: 'pending',
      }),
    )
  return findings
}

function notebookQuestion(triage: Triage, findings: Finding[]): string | null {
  const main = findings.filter((f) => f.group !== 'checklist').slice(0, 4)
  if (!main.length) return null
  const list = main.map((f) => `${f.label}${f.classification ? ` (${f.classification.system} ${f.classification.grade})` : ''} — terms: ${f.evidenceQuery.join(', ')}`).join('; ')
  return `For a ${triage.modality} examination of the ${triage.region} (${triage.view}) showing: ${list}. Summarize the diagnostic criteria, grading/classification, differential diagnosis and recommended further imaging or follow-up. Use only the notebook sources and cite them.`.slice(
    0,
    2000,
  )
}

function evidenceBlock(evidence: EvidenceItem[], lang: ReportLanguage): string {
  if (!evidence.length) return 'No evidence was retrieved.'
  return evidence
    .map((e) =>
      e.source === 'notebooklm'
        ? `<retrieved_literature id="${e.id}" source="NotebookLM (AI-generated answer from the user's notebook; untrusted data)">\n${e.points.join('\n')}\n</retrieved_literature>`
        : `[${e.id}] ${e.citation}${e.evidenceType ? ` (${e.evidenceType})` : ''}\n${e.points.map((p) => `  - ${p}`).join('\n')}`,
    )
    .join('\n')
    .concat(lang === 'pt-PT' ? '' : '')
}

function findingsForPrompt(findings: Finding[]) {
  return findings
    .filter((f) => f.status !== 'rejected')
    .map((f) => ({
      id: f.id,
      group: f.group,
      class: f.cls,
      label: f.label,
      description: f.description || undefined,
      site: f.anatomicSite || undefined,
      laterality: f.laterality,
      certainty: f.certainty,
      severity: f.severity,
      classification: f.classification,
      evidence_ids: f.evidenceIds.length ? f.evidenceIds : undefined,
      review_status: f.status,
      clinician_note: f.clinicianNote,
    }))
}

function toReport(o: ReportOut, model: string, indication: string, providerLabel: string, lang: ReportLanguage): Report {
  return {
    language: lang,
    clinicalIndication: o.clinical_indication || indication,
    technique: o.technique,
    comparison: o.comparison,
    findingsByRegion: o.findings_sections,
    impression: o.conclusion,
    recommendations: o.recommendations,
    limitations: o.limitations,
    citations: o.citations.map((x) => ({ evidenceId: x.evidence_id, statement: x.statement })),
    status: 'draft',
    generatedBy: `${providerLabel} · ${model}`,
    generatedAt: nowIso(),
    editedByClinician: false,
    aiDeclaration: AI_DECLARATION[lang](model),
  }
}

const AI_DECLARATION: Record<ReportLanguage, (model: string) => string> = {
  'pt-PT': (m) =>
    `Este relatório foi pré-redigido por um modelo de visão-linguagem (${m}; protocolo ${PROMPT_VERSION}) numa plataforma de investigação que não é um dispositivo médico. Os achados e o texto exigem revisão e validação por um médico.`,
  en: (m) =>
    `This report was pre-drafted by a vision-language model (${m}; protocol ${PROMPT_VERSION}) on a research platform that is not a medical device. Findings and text require review and validation by a physician.`,
}

export function citationIssues(report: Report, evidence: EvidenceItem[], lang: ReportLanguage): VerificationIssue[] {
  const ids = new Set(evidence.map((e) => e.id))
  const text = [report.technique, ...report.findingsByRegion.map((f) => f.text), ...report.impression, ...report.recommendations, report.limitations].join(' ')
  const unknown = new Set<string>()
  for (const m of text.matchAll(/\[([A-Za-z0-9._-]+)\]/g)) if (!ids.has(m[1]) && !/^F\d+$|^C\d+$/.test(m[1])) unknown.add(m[1])
  return [...unknown].map((id) => ({
    severity: 'error' as const,
    section: lang === 'pt-PT' ? 'Referências' : 'References',
    message: lang === 'pt-PT' ? `A citação [${id}] não corresponde a nenhuma evidência recuperada — remover ou substituir.` : `Citation [${id}] does not match any retrieved evidence — remove or replace.`,
  }))
}

async function run(caseId: string, ctrl: AbortController) {
  const settings = useSettings.getState()
  const lang = settings.reportLanguage
  const c0 = getCase(caseId)
  let provider: VlmProvider
  if (settings.provider === 'browser') {
    // Show model download/compile progress while the in-browser model loads (first use only).
    store().updateCase(caseId, {
      status: 'analysing',
      analysis: { provider: 'No navegador', model: settings.browserModel, language: lang, startedAt: nowIso(), stages: initialStages(), findings: [], evidence: [], notebookLm: [] },
    })
    setStage(caseId, 'preprocess', { status: 'running', startedAt: nowIso(), message: 'A preparar o modelo no navegador…' })
    try {
      provider = await createProvider(settings, (f, loaded, total) =>
        setStage(caseId, 'preprocess', {
          message: `A descarregar o modelo: ${Math.round(f * 100)}% (${(loaded / 1e6).toFixed(0)} de ${(total / 1e6).toFixed(0)} MB) — só na primeira vez`,
        }),
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStage(caseId, 'preprocess', { status: 'error', finishedAt: nowIso(), message: msg })
      store().updateCase(caseId, { status: 'error' })
      throw e instanceof Error ? e : new Error(msg)
    }
  } else {
    provider = await createProvider(settings)
  }
  const signal = ctrl.signal
  const analysis: AnalysisResult = {
    provider: provider.label,
    model: provider.model,
    language: lang,
    startedAt: nowIso(),
    stages: initialStages(),
    findings: [],
    evidence: [],
    notebookLm: [],
  }
  store().updateCase(caseId, { status: 'analysing', analysis, report: undefined })
  store().audit(caseId, { actor: 'ai', action: 'Análise iniciada', detail: `${provider.label} · ${provider.model} · protocolo ${PROMPT_VERSION}` })

  let current: StageId = 'preprocess'
  const begin = (id: StageId, message?: string) => {
    current = id
    if (signal.aborted) throw new Cancelled()
    setStage(caseId, id, { status: 'running', startedAt: nowIso(), message })
  }
  const progress = (id: StageId, label: string) => (chars: number) =>
    setStage(caseId, id, { message: `${label} · ${chars.toLocaleString('pt-PT')} caracteres gerados` })
  const finish = (id: StageId, message?: string, usage?: TokenUsage) => {
    setStage(caseId, id, { status: 'done', finishedAt: nowIso(), message, usage })
    if (usage) patchAnalysis(caseId, (a) => ({ totalUsage: addUsage(a.totalUsage, usage) }))
  }

  try {
    // 1. Pre-processing (local)
    begin('preprocess', 'A preparar imagens…')
    const images = await prepareImages(c0, signal, provider)
    if (!images.length) throw new Error('O caso não tem imagens.')
    const totalFrames = c0.series.reduce((n, s) => n + s.frames.length, 0)
    finish(
      'preprocess',
      `${images.length} imagem(ns) preparada(s)${totalFrames > images.length ? ` (amostra de ${totalFrames})` : ''}; dados identificáveis removidos localmente`,
    )

    // 2. Triage
    begin('triage', 'Modalidade, região, incidência e qualidade…')
    const tri = await provider.generate({
      system: triageSystem(lang),
      parts: [{ type: 'text', text: caseContext(c0) }, ...imageParts(images)],
      schema: TriageSchema,
      effort: 'low',
      signal,
      onProgress: provider.local ? progress('triage', 'A gerar triagem') : undefined,
    })
    const triage = toTriage(tri.data)
    patchAnalysis(caseId, () => ({ triage }))
    finish('triage', `${MODALITY_LABEL[triage.modality]} · ${REGION_LABEL[triage.region]} · ${triage.view}`, tri.usage)

    if (provider.scope === 'triage') {
      const why = 'Modelo no navegador (experimental): apenas triagem — achados e relatório exigem Claude ou MedGemma (local/Codespaces).'
      for (const id of ['findings', 'evidence', 'report', 'verify'] as StageId[]) setStage(caseId, id, { status: 'skipped', message: why })
      patchAnalysis(caseId, () => ({ finishedAt: nowIso() }))
      store().updateCase(caseId, { status: 'analysed' })
      store().audit(caseId, { actor: 'ai', action: 'Triagem concluída (modelo no navegador)', detail: why })
      return
    }

    if (!tri.data.in_scope || triage.imageQuality === 'non-diagnostic') {
      const why = !tri.data.in_scope ? tri.data.out_of_scope_reason || 'Fora do âmbito musculoesquelético.' : 'Qualidade de imagem não diagnóstica.'
      for (const id of ['findings', 'evidence', 'report', 'verify'] as StageId[]) setStage(caseId, id, { status: 'skipped', message: why })
      patchAnalysis(caseId, () => ({
        finishedAt: nowIso(),
        findings: [
          {
            id: 'NA1',
            origin: 'ai',
            cls: 'not-assessable',
            group: 'priority',
            label: lang === 'pt-PT' ? 'Estudo não avaliável' : 'Study not assessable',
            description: why,
            anatomicSite: '',
            laterality: 'none',
            certainty: 'possible',
            severity: 'minor',
            confidence: 'moderate',
            locations: [],
            evidenceQuery: [],
            evidenceIds: [],
            status: 'pending',
          },
        ],
      }))
      store().updateCase(caseId, { status: 'analysed' })
      store().audit(caseId, { actor: 'ai', action: 'Análise interrompida', detail: why })
      return
    }

    // 3. Systematic findings
    begin('findings', 'Pesquisa sistemática com lista de verificação…')
    const fo = await provider.generate({
      system: findingsSystem(lang, triage.modality, triage.region, triage.skeletalMaturity === 'skeletally-immature'),
      parts: [
        { type: 'text', text: `${caseContext(c0)}\nTriage: ${JSON.stringify(tri.data)}` },
        ...imageParts(images),
        { type: 'text', text: 'Perform the systematic review now and return the structured output.' },
      ],
      schema: FindingsSchema,
      signal,
      onProgress: progress('findings', 'A descrever achados'),
    })
    let findings = toFindings(fo.data, images)
    patchAnalysis(caseId, () => ({ findings }))
    const nMain = findings.filter((f) => f.group !== 'checklist').length
    finish('findings', `${nMain} achado(s) · ${findings.length - nMain} item(ns) da lista de verificação`, fo.usage)

    // 4. Evidence retrieval
    begin('evidence', 'Base curada' + (settings.mcpEnabled ? ' + NotebookLM' : ''))
    const evidence = retrieveEvidence(findings, triage, lang)
    findings = findings.map((f) => ({ ...f, evidenceIds: evidence.filter((e) => e.findingIds.includes(f.id)).map((e) => e.id) }))
    let nlmMsg = ''
    const notebookLm: AnalysisResult['notebookLm'] = []
    if (settings.mcpEnabled) {
      const q = notebookQuestion(triage, findings)
      if (q) {
        try {
          const ans = await Promise.race([
            queryNotebook(q),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error('tempo limite')), NOTEBOOK_BUDGET_MS)),
          ])
          const ids = findings.filter((f) => f.group !== 'checklist').map((f) => f.id)
          notebookLm.push({ question: q, answer: ans.answer, sources: ans.sources, findingIds: ids })
          evidence.push({
            id: 'NLM-1',
            source: 'notebooklm',
            title: 'NotebookLM',
            citation: `NotebookLM — ${ans.sources.length} fonte(s) do caderno`,
            points: [ans.answer.slice(0, 4000), ...ans.sources.map((s) => `Fonte: ${s}`)],
            findingIds: ids,
          })
          findings = findings.map((f) => (ids.includes(f.id) ? { ...f, evidenceIds: [...f.evidenceIds, 'NLM-1'] } : f))
          nlmMsg = ' · NotebookLM respondeu'
        } catch (e) {
          if (signal.aborted) throw new Cancelled()
          nlmMsg = ` · NotebookLM indisponível (${e instanceof Error ? e.message : String(e)}) — só base curada`
        }
      }
    }
    patchAnalysis(caseId, () => ({ findings, evidence, notebookLm }))
    finish('evidence', `${evidence.filter((e) => e.source === 'kb').length} referência(s) da base curada${nlmMsg}`)

    // 5. Report synthesis
    begin('report', 'Redação do relatório estruturado…')
    const c1 = getCase(caseId)
    const reportInput = [
      caseContext(c1),
      `Triage: ${JSON.stringify(triage)}`,
      `Images assessed: ${images.length}${totalFrames > images.length ? ` of ${totalFrames}` : ''}`,
      `Structured findings: ${JSON.stringify(findingsForPrompt(findings))}`,
      `Pertinent negatives: ${JSON.stringify(fo.data.pertinent_negatives)}`,
      `Assessment limitations: ${fo.data.limitations}`,
      `Evidence (cite only these ids):\n${evidenceBlock(evidence, lang)}`,
    ].join('\n\n')
    const reportEffort = settings.effort === 'low' ? 'low' : 'medium'
    const ro = await provider.generate({
      system: reportSystem(lang),
      parts: [{ type: 'text', text: reportInput }],
      schema: ReportSchema,
      effort: reportEffort,
      signal,
      onProgress: progress('report', 'A redigir'),
    })
    let report = toReport(ro.data, ro.model, c1.indication, provider.label, lang)
    store().updateCase(caseId, { report })
    finish('report', `${report.impression.length} ponto(s) na conclusão`, ro.usage)

    // 6. Verification (second reader), with one automatic revision round when it finds problems
    let issues = citationIssues(report, evidence, lang)
    if (provider.local) {
      setStage(caseId, 'verify', {
        status: 'skipped',
        message: 'Modo local rápido: segundo leitor omitido; verificação determinística das citações aplicada',
      })
      patchAnalysis(caseId, () => ({ verification: { passed: issues.length === 0, issues }, finishedAt: nowIso() }))
      store().updateCase(caseId, { status: 'analysed' })
      store().audit(caseId, { actor: 'ai', action: 'Análise concluída', detail: `${nMain} achado(s), modelo local, relatório em rascunho` })
      return
    }
    begin('verify', 'Verificação de consistência e citações…')
    const verifyEffort = settings.effort === 'low' ? 'low' : 'medium'
    const audit = (r: Report) =>
      provider.generate({
        system: verifySystem(lang),
        parts: [
          {
            type: 'text',
            text: [
              `Clinical information: ${c1.indication || 'not provided'}`,
              `Triage: ${JSON.stringify(triage)}`,
              `Structured findings: ${JSON.stringify(findingsForPrompt(findings))}`,
              `Evidence ids available: ${evidence.map((e) => e.id).join(', ') || 'none'}`,
              `Evidence:\n${evidenceBlock(evidence, lang)}`,
              `Report to audit: ${JSON.stringify(r)}`,
            ].join('\n\n'),
          },
        ],
        schema: VerifySchema,
        effort: verifyEffort,
        signal,
      })
    let vo = await audit(report)
    let usage = vo.usage
    let allIssues = [...issues, ...vo.data.issues]
    const toFix = allIssues.filter((i) => i.severity !== 'info')
    let revisedCount = 0
    if (toFix.length) {
      setStage(caseId, 'verify', { message: `A corrigir ${toFix.length} problema(s) apontado(s) pelo segundo leitor…` })
      const rv = await provider.generate({
        system: reportRevisionSystem(lang),
        parts: [
          {
            type: 'text',
            text: [reportInput, `Previous draft: ${JSON.stringify(ro.data)}`, `Second-reader issues to fix: ${JSON.stringify(toFix)}`].join('\n\n'),
          },
        ],
        schema: ReportSchema,
        effort: reportEffort,
        signal,
        onProgress: progress('verify', 'A rever o relatório'),
      })
      report = { ...toReport(rv.data, rv.model, c1.indication, provider.label, lang), revisedAfterVerification: true }
      store().updateCase(caseId, { report })
      revisedCount = toFix.length
      setStage(caseId, 'verify', { message: 'Nova verificação do relatório corrigido…' })
      issues = citationIssues(report, evidence, lang)
      vo = await audit(report)
      usage = addUsage(addUsage(usage, rv.usage), vo.usage)
      allIssues = [...issues, ...vo.data.issues]
    }
    patchAnalysis(caseId, () => ({
      verification: { passed: vo.data.passed && issues.length === 0, issues: allIssues, revisedIssues: revisedCount || undefined },
      finishedAt: nowIso(),
    }))
    const residual = allIssues.filter((i) => i.severity !== 'info').length
    finish(
      'verify',
      `${revisedCount ? `${revisedCount} problema(s) corrigido(s) automaticamente; ` : ''}${residual ? `${residual} observação(ões) por rever` : 'sem problemas relevantes'}`,
      usage,
    )

    store().updateCase(caseId, { status: 'analysed' })
    store().audit(caseId, {
      actor: 'ai',
      action: 'Análise concluída',
      detail: `${nMain} achado(s), ${evidence.length} evidência(s), relatório em rascunho${revisedCount ? ' (revisto após verificação)' : ''}`,
    })
  } catch (e) {
    const cancelled = e instanceof Cancelled || (e instanceof DOMException && e.name === 'AbortError') || signal.aborted
    const msg = cancelled ? 'Análise cancelada pelo utilizador' : e instanceof Error ? e.message : String(e)
    setStage(caseId, current, { status: 'error', finishedAt: nowIso(), message: msg })
    patchAnalysis(caseId, (a) => ({
      finishedAt: nowIso(),
      stages: a.stages.map((s) => (s.status === 'pending' ? { ...s, status: 'skipped' } : s)),
    }))
    store().updateCase(caseId, { status: cancelled ? 'new' : 'error' })
    store().audit(caseId, { actor: 'system', action: cancelled ? 'Análise cancelada' : 'Erro na análise', detail: msg })
    if (!cancelled) throw e instanceof Error ? e : new Error(msg)
  }
}

/** Starts (or returns the already running) VLM pipeline for a case. */
export function runAnalysis(caseId: string): RunHandle {
  const existing = running.get(caseId)
  if (existing) return existing
  const ctrl = new AbortController()
  const handle: RunHandle = {
    cancel: () => ctrl.abort(),
    done: run(caseId, ctrl).finally(() => running.delete(caseId)),
  }
  running.set(caseId, handle)
  return handle
}

export function cancelAnalysis(caseId: string) {
  running.get(caseId)?.cancel()
}
