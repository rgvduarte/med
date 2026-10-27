import type { EvidenceItem, Finding, ReportLanguage, Triage } from '../../types'
import raw from '../../data/evidence.json'
import { retrieveFrom, type KbEntry } from './kbcore'

export { citationOf, findingQuery, scoreEntry, tokens, type KbEntry } from './kbcore'

/** The curated, verified evidence base shipped with the app. */
export const KB: KbEntry[] = raw as KbEntry[]

/**
 * Deterministic retrieval from the curated base: top-k references per finding plus a
 * small set of method references (VLM limitations / reporting) for the limitations section.
 */
export function retrieveEvidence(findings: Finding[], triage: Triage | undefined, lang: ReportLanguage, perFinding = 3): EvidenceItem[] {
  return retrieveFrom(KB, findings, triage, lang, perFinding)
}
