// PT-PT labels for the worklist result column, report states, evidence and report sections.
import type { FindingClass, Modality, VerbalConfidence } from '../types'

/** Study-level AI result shown in the worklist (BoneView-style class + pipeline states). */
export type CaseResult = FindingClass | 'triage' | 'analysing' | 'new' | 'error'

export const CASE_RESULT_LABEL: Record<CaseResult, string> = {
  positive: 'Positivo',
  doubtful: 'Duvidoso',
  negative: 'Negativo',
  'not-assessable': 'Não avaliável',
  triage: 'Só triagem',
  analysing: 'A analisar…',
  new: 'Por analisar',
  error: 'Erro',
}

export const CASE_RESULT_HINT: Record<CaseResult, string> = {
  positive: 'Pelo menos um achado positivo sugerido pela IA — verificar',
  doubtful: 'Sem achados positivos; pelo menos um achado duvidoso — verificar',
  negative: 'A IA não detetou achados — verificar',
  'not-assessable': 'Estudo não avaliável pela IA (qualidade, âmbito ou recusa do modelo)',
  triage: 'O modelo no navegador identificou modalidade, região e qualidade; não procurou achados',
  analysing: 'Análise em curso',
  new: 'Ainda não analisado',
  error: 'A análise falhou',
}

/** Default worklist order: positive > doubtful > not assessable > error > analysing > not analysed > negative. */
export const CASE_RESULT_ORDER: Record<CaseResult, number> = {
  positive: 0,
  doubtful: 1,
  'not-assessable': 2,
  error: 3,
  triage: 4,
  analysing: 5,
  new: 6,
  negative: 7,
}

export const FINDING_CLASS_LABEL: Record<FindingClass, string> = {
  positive: 'Positivo',
  doubtful: 'Duvidoso',
  negative: 'Não detetado',
  'not-assessable': 'Não avaliável',
}

export const VERBAL_CONFIDENCE_LABEL: Record<VerbalConfidence, string> = {
  high: 'Alta',
  moderate: 'Moderada',
  low: 'Baixa',
}

export type ReportState = 'none' | 'draft' | 'review' | 'validated'

export const REPORT_STATE_LABEL: Record<ReportState, string> = {
  none: 'Sem relatório',
  draft: 'Rascunho IA',
  review: 'Em revisão',
  validated: 'Validado',
}

export const REPORT_STATE_HINT: Record<ReportState, string> = {
  none: 'O relatório é gerado no fim da análise',
  draft: 'Texto gerado pela IA, ainda não revisto pelo médico',
  review: 'Em revisão pelo médico (texto editado ou secções aceites)',
  validated: 'Validado e bloqueado pelo médico',
}

/** Portuguese modality abbreviations used in lists, with the DICOM code as tooltip. */
export const MODALITY_ABBR: Record<Modality, string> = {
  XR: 'RX',
  CT: 'TC',
  MR: 'RM',
  US: 'Eco',
  XA: 'Fluoro',
  OT: 'Outra',
}

export const MODALITY_DICOM: Record<Modality, string> = {
  XR: 'DX/CR',
  CT: 'CT',
  MR: 'MR',
  US: 'US',
  XA: 'XA/RF',
  OT: 'OT',
}

/** Study design (neutral badges — they describe design, not quality). */
const EVIDENCE_TYPE_RULES: [RegExp, string][] = [
  [/guideline|consensus|recommendation|consenso|norma/i, 'Guideline/Consenso'],
  [/systematic|meta.?analy|revis[aã]o sistem/i, 'Revisão sistemática'],
  [/diagnostic|accuracy|exatid|diagn[oó]stic/i, 'Estudo diagnóstico'],
  [/cohort|coorte|prospective|retrospective/i, 'Coorte'],
  [/narrative|review|revis[aã]o/i, 'Revisão narrativa'],
  [/book|chapter|textbook|livro|cap[ií]tulo/i, 'Livro/Capítulo'],
  [/classification|classifica/i, 'Classificação'],
  [/rct|randomi[sz]ed|ensaio/i, 'Ensaio clínico'],
]

export function evidenceTypeLabel(type: string | undefined): string | undefined {
  if (!type) return undefined
  for (const [re, label] of EVIDENCE_TYPE_RULES) if (re.test(type)) return label
  return type
}

/** Report section keys (stored in Report.reviewedSections) and their labels. */
export type ReportSectionKey = 'indication' | 'technique' | 'comparison' | 'findings' | 'impression' | 'recommendations' | 'limitations'

export const REPORT_SECTIONS: { key: ReportSectionKey; pt: string; en: string }[] = [
  { key: 'indication', pt: 'Indicação clínica', en: 'Clinical information' },
  { key: 'technique', pt: 'Técnica', en: 'Technique' },
  { key: 'comparison', pt: 'Comparação', en: 'Comparison' },
  { key: 'findings', pt: 'Achados', en: 'Findings' },
  { key: 'impression', pt: 'Conclusão', en: 'Impression' },
  { key: 'recommendations', pt: 'Recomendações', en: 'Recommendations' },
  { key: 'limitations', pt: 'Limitações', en: 'Limitations' },
]

export const DEFAULT_COMPARISON = 'Sem exames prévios disponíveis para comparação.'
