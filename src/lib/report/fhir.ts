import type { Case, EvidenceItem, Finding, Report } from '../../types'
import { CERTAINTY_LABEL, LATERALITY_LABEL } from '../labels'
import { FINDING_CLASS_LABEL, VERBAL_CONFIDENCE_LABEL } from '../labels-report'
import { citedEvidence, reportToText } from './format'
import { findingCode } from './state'

/** Extension carrying AI provenance on the DiagnosticReport and on each Observation. */
export const AI_PROVENANCE_URL = 'https://rgvduarte.github.io/med/fhir/StructureDefinition/ai-provenance'

const LOINC_IMAGING = { system: 'http://loinc.org', code: '18748-4', display: 'Diagnostic imaging study' }

function b64utf8(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

type Ext = { url: string; valueString?: string; valueBoolean?: boolean; valueDateTime?: string; valueCode?: string; extension?: Ext[] }

function aiProvenance(c: Case, r: Report, f?: Finding): Ext {
  const a = c.analysis
  const sub: Ext[] = [
    { url: 'aiAssisted', valueBoolean: true },
    { url: 'generator', valueString: r.generatedBy },
  ]
  if (a) {
    sub.push({ url: 'provider', valueString: a.provider }, { url: 'model', valueString: a.model }, { url: 'analysisStarted', valueDateTime: a.startedAt })
    if (a.precomputed) sub.push({ url: 'precomputed', valueBoolean: true })
  }
  if (f) {
    sub.push(
      { url: 'origin', valueCode: f.origin },
      { url: 'reviewStatus', valueCode: f.status },
      { url: 'findingClass', valueCode: f.cls },
      { url: 'selfReportedConfidence', valueCode: f.confidence },
      { url: 'confidenceCalibrated', valueBoolean: false },
    )
  } else {
    sub.push({ url: 'clinicianValidated', valueBoolean: r.status === 'validated' })
    if (r.contentHash) sub.push({ url: 'contentSha256', valueString: r.contentHash })
  }
  return { url: AI_PROVENANCE_URL, extension: sub }
}

function observationFor(c: Case, r: Report, f: Finding, subject: unknown) {
  const code = findingCode(c, f.id)
  const lang = r.language
  const site = [f.anatomicSite, f.laterality !== 'none' && f.laterality !== 'unknown' ? LATERALITY_LABEL[f.laterality] : ''].filter(Boolean).join(' · ')
  const notes = [f.description, f.clinicianNote ? `Nota do médico: ${f.clinicianNote}` : ''].filter(Boolean)
  return {
    resourceType: 'Observation',
    id: `obs-${code.toLowerCase()}`,
    status: r.status === 'validated' ? 'final' : 'preliminary',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'imaging', display: 'Imaging' }] }],
    code: { text: f.label },
    subject,
    effectiveDateTime: c.createdAt,
    valueString: `${CERTAINTY_LABEL[lang][f.certainty]} ${f.label.charAt(0).toLowerCase()}${f.label.slice(1)}`,
    interpretation: [{ text: FINDING_CLASS_LABEL[f.cls] }],
    bodySite: site ? { text: site } : undefined,
    note: notes.map((text) => ({ text })),
    method: { text: `Sugerido por IA; confiança declarada ${VERBAL_CONFIDENCE_LABEL[f.confidence].toLowerCase()} (não calibrada); ${f.status === 'edited' ? 'editado' : 'aceite'} pelo médico` },
    extension: [aiProvenance(c, r, f)],
    identifier: [{ system: 'urn:mskvlm:finding', value: `${c.pseudoId}/${code}` }],
  }
}

/**
 * FHIR R4 DiagnosticReport with one contained Observation per accepted or edited finding,
 * a pseudonymous subject and an AI provenance extension. Status is preliminary until validated.
 */
export function toFhirDiagnosticReport(c: Case, r: Report, evidence: EvidenceItem[]) {
  const subject = { identifier: { system: 'urn:mskvlm:pseudonym', value: c.pseudoId }, display: c.pseudoId }
  const findings = (c.analysis?.findings ?? []).filter((f) => f.group !== 'checklist' && (f.status === 'accepted' || f.status === 'edited'))
  const observations = findings.map((f) => observationFor(c, r, f, subject))
  const refs = citedEvidence(r, evidence)
  return {
    resourceType: 'DiagnosticReport',
    id: c.id,
    meta: { tag: [{ system: 'urn:mskvlm:tag', code: 'research-prototype', display: 'Protótipo de investigação — não é um dispositivo médico' }] },
    contained: observations,
    extension: [aiProvenance(c, r)],
    identifier: [{ system: 'urn:mskvlm:case', value: c.id }],
    status: r.status === 'validated' ? 'final' : 'preliminary',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'RAD', display: 'Radiology' }] }],
    code: { coding: [LOINC_IMAGING], text: c.title },
    subject,
    effectiveDateTime: c.createdAt,
    issued: r.validatedAt ?? r.generatedAt,
    resultsInterpreter: r.validatedBy ? [{ display: `${r.validatedBy}${r.validatorLicence ? ` (cédula ${r.validatorLicence})` : ''}` }] : undefined,
    result: observations.map((o) => ({ reference: `#${o.id}`, display: o.code.text })),
    conclusion: r.impression.join(' '),
    presentedForm: [
      {
        contentType: 'text/plain; charset=utf-8',
        language: r.language,
        data: b64utf8(reportToText(c, r, evidence)),
        title: r.language === 'en' ? 'Report' : 'Relatório',
      },
    ],
    // Cited references are listed in the narrative for traceability.
    text: {
      status: 'additional',
      div: `<div xmlns="http://www.w3.org/1999/xhtml"><p>${escapeXml(c.pseudoId)} — ${escapeXml(r.status === 'validated' ? 'validado' : 'rascunho não validado')}</p>${
        refs.length ? `<ol>${refs.map((e) => `<li>${escapeXml(e.citation)}${e.doi ? ` doi:${escapeXml(e.doi)}` : ''}</li>`).join('')}</ol>` : ''
      }</div>`,
    },
  }
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[ch] ?? ch)
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function downloadJson(filename: string, data: unknown) {
  downloadBlob(filename, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
}

export function downloadText(filename: string, text: string, type = 'text/plain;charset=utf-8') {
  downloadBlob(filename, new Blob([text], { type }))
}
