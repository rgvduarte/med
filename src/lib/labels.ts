import type {
  CaseStatus,
  Certainty,
  FindingStatus,
  Laterality,
  Modality,
  Region,
  ReportLanguage,
  Severity,
  StageId,
} from '../types'

export const MODALITY_LABEL: Record<Modality, string> = {
  XR: 'Radiografia',
  CT: 'TC',
  MR: 'RM',
  US: 'Ecografia',
  XA: 'Fluoroscopia',
  OT: 'Outra',
}

export const REGION_LABEL: Record<Region, string> = {
  shoulder: 'Ombro',
  elbow: 'Cotovelo',
  'wrist-hand': 'Punho e mão',
  'hip-pelvis': 'Anca e bacia',
  knee: 'Joelho',
  'ankle-foot': 'Tornozelo e pé',
  spine: 'Coluna',
  'long-bones': 'Ossos longos',
  other: 'Outra',
}

export const REGION_LABEL_EN: Record<Region, string> = {
  shoulder: 'Shoulder',
  elbow: 'Elbow',
  'wrist-hand': 'Wrist and hand',
  'hip-pelvis': 'Hip and pelvis',
  knee: 'Knee',
  'ankle-foot': 'Ankle and foot',
  spine: 'Spine',
  'long-bones': 'Long bones',
  other: 'Other',
}

export const LATERALITY_LABEL: Record<Laterality, string> = {
  left: 'Esquerdo',
  right: 'Direito',
  bilateral: 'Bilateral',
  none: 'N/A',
  unknown: 'Indeterminado',
}

export const STATUS_LABEL: Record<CaseStatus, string> = {
  new: 'Novo',
  analysing: 'Em análise',
  analysed: 'Analisado (rascunho)',
  validated: 'Validado',
  error: 'Erro',
}

export const STATUS_BADGE: Record<CaseStatus, string> = {
  new: 'badge-neutral',
  analysing: 'badge-info',
  analysed: 'badge-ai',
  validated: 'badge-normal',
  error: 'badge-critical',
}

export const CERTAINTY_LABEL: Record<ReportLanguage, Record<Certainty, string>> = {
  'pt-PT': {
    'consistent-with': 'Compatível com',
    'suspicious-for': 'Suspeito de',
    possible: 'Possível',
    'less-likely': 'Menos provável',
    unlikely: 'Improvável',
  },
  en: {
    'consistent-with': 'Consistent with',
    'suspicious-for': 'Suspicious for',
    possible: 'Possible',
    'less-likely': 'Less likely',
    unlikely: 'Unlikely',
  },
}

/** Approximate probability ranges (Panicek & Hricak, AJR 2016) shown as a tooltip. */
export const CERTAINTY_RANGE: Record<Certainty, string> = {
  'consistent-with': '>90%',
  'suspicious-for': '≈75%',
  possible: '≈50%',
  'less-likely': '≈25%',
  unlikely: '<10%',
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Crítico',
  significant: 'Relevante',
  minor: 'Menor',
  normal: 'Normal',
}

export const SEVERITY_BADGE: Record<Severity, string> = {
  critical: 'badge-critical',
  significant: 'badge-significant',
  minor: 'badge-minor',
  normal: 'badge-normal',
}

export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  pending: 'Por rever',
  accepted: 'Aceite',
  rejected: 'Rejeitado',
  edited: 'Editado',
}

export const STAGE_LABEL: Record<StageId, string> = {
  preprocess: 'Pré-processamento local',
  triage: 'Triagem (modalidade, região, qualidade)',
  findings: 'Pesquisa sistemática de achados',
  evidence: 'Recuperação de evidência',
  report: 'Síntese do relatório',
  verify: 'Verificação de consistência',
}
