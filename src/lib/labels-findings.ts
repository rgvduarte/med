// PT-PT (AO90) labels for the case workspace, the viewer and the AI findings panel.
// Kept apart from labels.ts so the findings UI can evolve without touching shared maps.
import type { FindingClass, FindingGroup, FindingStatus, Laterality, Modality, StageId, StageStatus, VerbalConfidence } from '../types'

/** Upper-case study/finding chip text (BoneView-style: shape + text + colour). */
export const CLASS_CHIP: Record<FindingClass, string> = {
  positive: 'POSITIVO',
  doubtful: 'DUVIDOSO',
  negative: 'NEGATIVO',
  'not-assessable': 'NÃO AVALIÁVEL',
}

export const CLASS_LABEL: Record<FindingClass, string> = {
  positive: 'Positivo',
  doubtful: 'Duvidoso',
  negative: 'Não detetado',
  'not-assessable': 'Não avaliável',
}

export const GROUP_LABEL: Record<FindingGroup | 'notAssessable' | 'rejected', string> = {
  priority: 'Prioritários',
  other: 'Outros',
  /** Checklist items the AI assessed and did not detect. */
  checklist: 'Não detetados',
  /** Checklist items the AI could not assess (indeterminate) — not the same as «não detetado». */
  notAssessable: 'Não avaliáveis',
  rejected: 'Rejeitados',
}

export const CONFIDENCE_WORD: Record<VerbalConfidence, string> = {
  high: 'Alta',
  moderate: 'Moderada',
  low: 'Baixa',
}

/** Number of filled segments in the 3-segment confidence meter. */
export const CONFIDENCE_LEVEL: Record<VerbalConfidence, 1 | 2 | 3> = {
  high: 3,
  moderate: 2,
  low: 1,
}

export const CONFIDENCE_HELP = 'Confiança declarada pelo modelo, não calibrada. Use como indicação, não como probabilidade.'

export const REVIEW_LABEL: Record<FindingStatus, string> = {
  pending: 'Pendente',
  accepted: 'Confirmado',
  edited: 'Editado',
  rejected: 'Rejeitado',
}

export const REJECT_REASONS = ['Falso positivo', 'Localização errada', 'Classificação errada', 'Não relevante', 'Outro'] as const
export type RejectReason = (typeof REJECT_REASONS)[number]

export const AI_HINT = 'Sugestão da IA — verificar'
export const AI_GENERATED = 'Gerado por IA — verificar'
export const APPROX_HINT = 'Localização aproximada (modelo de linguagem visual)'

/** Portuguese radiology abbreviations (tooltip carries the DICOM code). */
export const MODALITY_SHORT: Record<Modality, string> = {
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
  XA: 'RF/XA',
  OT: 'OT',
}

/** D / E as used in Portuguese reports (orientation markers on images stay R / L). */
export const LATERALITY_SHORT: Record<Laterality, string> = {
  left: 'E',
  right: 'D',
  bilateral: 'bilateral',
  none: '',
  unknown: '',
}

export const LATERALITY_OPTIONS: { value: Laterality; label: string }[] = [
  { value: 'right', label: 'Direita' },
  { value: 'left', label: 'Esquerda' },
  { value: 'bilateral', label: 'Bilateral' },
  { value: 'none', label: 'Não aplicável' },
  { value: 'unknown', label: 'Indeterminada' },
]

export const PIPELINE_ORDER: StageId[] = ['preprocess', 'triage', 'findings', 'evidence', 'report', 'verify']

export const PIPELINE_STEP: Record<StageId, { label: string; hint: string }> = {
  preprocess: { label: 'Preparação das imagens', hint: 'anonimização · redimensionamento · fotogramas-chave' },
  triage: { label: 'Triagem', hint: 'modalidade · região · incidência · qualidade' },
  findings: { label: 'Análise visual (VLM)', hint: 'pesquisa sistemática de achados' },
  evidence: { label: 'Pesquisa de evidência', hint: 'NotebookLM · base curada' },
  report: { label: 'Síntese do relatório', hint: 'rascunho estruturado com referências' },
  verify: { label: 'Verificações de segurança', hint: 'lateralidade · citações · dados pessoais' },
}

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  pending: 'Pendente',
  running: 'Em curso',
  done: 'Concluída',
  skipped: 'Ignorada',
  error: 'Erro',
}

export const PROVIDER_LABEL: Record<string, string> = {
  anthropic: 'Claude (API)',
  'openai-compatible': 'Modelo local',
}

export function ageBand(age: number | undefined): string {
  if (age === undefined || !Number.isFinite(age)) return 'idade —'
  if (age < 18) return '<18 a'
  if (age < 40) return '18–39 a'
  if (age < 65) return '40–64 a'
  return '≥65 a'
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}
