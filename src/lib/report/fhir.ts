import type { Case, EvidenceItem, Report } from '../../types'
import { reportToText } from './format'

const LOINC_BY_MODALITY: Record<string, { code: string; display: string }> = {
  XR: { code: '18748-4', display: 'Diagnostic imaging study' },
  CT: { code: '18748-4', display: 'Diagnostic imaging study' },
  MR: { code: '18748-4', display: 'Diagnostic imaging study' },
  US: { code: '18748-4', display: 'Diagnostic imaging study' },
}

function b64utf8(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** Minimal FHIR R4 DiagnosticReport (pseudonymous subject, AI-assisted, status preliminary/final). */
export function toFhirDiagnosticReport(c: Case, r: Report, evidence: EvidenceItem[]) {
  const code = LOINC_BY_MODALITY[c.series[0]?.modality ?? 'XR'] ?? LOINC_BY_MODALITY.XR
  return {
    resourceType: 'DiagnosticReport',
    id: c.id,
    status: r.status === 'validated' ? 'final' : 'preliminary',
    category: [
      {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'RAD', display: 'Radiology' }],
      },
    ],
    code: { coding: [{ system: 'http://loinc.org', ...code }], text: c.title },
    subject: { identifier: { system: 'urn:mskvlm:pseudonym', value: c.pseudoId } },
    effectiveDateTime: c.createdAt,
    issued: r.validatedAt ?? r.generatedAt,
    resultsInterpreter: r.validatedBy ? [{ display: r.validatedBy }] : undefined,
    conclusion: r.impression.join(' '),
    extension: [
      {
        url: 'urn:mskvlm:ai-assisted',
        valueString: `${r.generatedBy}; ${r.status === 'validated' ? 'validated by clinician' : 'not validated'}`,
      },
    ],
    presentedForm: [
      {
        contentType: 'text/plain; charset=utf-8',
        language: r.language,
        data: b64utf8(reportToText(c, r, evidence)),
        title: 'Relatório',
      },
    ],
  }
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
