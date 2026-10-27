import type { StageId, StageState } from '../../types'

export const STAGES: StageId[] = ['preprocess', 'triage', 'findings', 'evidence', 'report', 'verify']

export function initialStages(): StageState[] {
  return STAGES.map((id) => ({ id, status: 'pending' }))
}

export interface RunHandle {
  cancel: () => void
  done: Promise<void>
}

/** Starts the VLM pipeline for a case. Replaced by the full implementation in pipeline.ts. */
export function runAnalysis(_caseId: string): RunHandle {
  return {
    cancel: () => undefined,
    done: Promise.reject(new Error('O motor de análise VLM está a ser integrado nesta versão de pré-visualização.')),
  }
}
