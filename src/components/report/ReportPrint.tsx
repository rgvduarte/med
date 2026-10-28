import { createPortal } from 'react-dom'
import type { Case, Report } from '../../types'
import { aiDeclarationFor, citationNumbers, citedEvidence, numberCitations, reportStrings, studyLine, verificationNote } from '../../lib/report/format'
import { reportState } from '../../lib/report/state'
import { REPORT_STATE_LABEL } from '../../lib/labels-report'
import { formatDate, formatDateTime } from '../../lib/util'

/**
 * Print-only document (light paper theme, A4). Rendered into <body> so printing never picks up
 * the dark workspace; hidden on screen. Drafts carry a diagonal «RASCUNHO — NÃO VALIDADO» watermark.
 */
export function ReportPrint({ c, r }: { c: Case; r: Report }) {
  const t = reportStrings(r)
  const evidence = c.analysis?.evidence ?? []
  const nums = citationNumbers(r, evidence)
  const cite = (s: string) => numberCitations(s, nums)
  const refs = citedEvidence(r, evidence)
  const draft = r.status !== 'validated'
  const state = reportState(r)
  const sex = c.sex === 'F' ? 'Feminino' : c.sex === 'M' ? 'Masculino' : c.sex === 'X' ? 'Não indicado' : '—'

  return createPortal(
    <div className="print-area theme-paper rp-print" aria-hidden="true">
      {draft && (
        <div className="rp-watermark">
          <span>{t.watermark}</span>
        </div>
      )}
      <div className="rp-print-banner">{t.app}</div>
      <h1>{t.title}</h1>
      <table className="rp-print-meta">
        <tbody>
          <tr>
            <th>Caso</th>
            <td>{c.pseudoId}</td>
            <th>Sexo / idade</th>
            <td>
              {sex} / {c.ageYears ? `${c.ageYears} anos` : '—'}
            </td>
          </tr>
          <tr>
            <th>Estudo</th>
            <td>{studyLine(c, r.language)}</td>
            <th>{t.uploadDate}</th>
            <td>{formatDate(c.createdAt)}</td>
          </tr>
          <tr>
            <th>Estado</th>
            <td>{REPORT_STATE_LABEL[state]}</td>
            <th>{t.reportDate}</th>
            <td>{formatDate(r.generatedAt)}</td>
          </tr>
        </tbody>
      </table>
      {draft && <p className="rp-print-draft">{t.draft}</p>}

      <h2>{t.indication}</h2>
      <p>{cite(r.clinicalIndication || '—')}</p>
      <h2>{t.technique}</h2>
      <p>{cite(r.technique || '—')}</p>
      <h2>{t.comparison}</h2>
      <p>{cite(r.comparison || '—')}</p>
      <h2>{t.findings}</h2>
      {r.findingsByRegion.map((f, i) => (
        <p key={i}>
          <strong>{f.heading}.</strong> {cite(f.text)}
        </p>
      ))}
      <h2>{t.impression}</h2>
      <ol className="rp-print-conclusion">
        {r.impression.map((x, i) => (
          <li key={i}>{cite(x)}</li>
        ))}
      </ol>
      {r.recommendations.length > 0 && (
        <>
          <h2>{t.recommendations}</h2>
          <ul>
            {r.recommendations.map((x, i) => (
              <li key={i}>{cite(x)}</li>
            ))}
          </ul>
        </>
      )}
      {r.limitations && (
        <>
          <h2>{t.limitations}</h2>
          <p>{cite(r.limitations)}</p>
        </>
      )}
      {refs.length > 0 && (
        <>
          <h2>{t.references}</h2>
          <ol className="rp-print-refs">
            {refs.map((e) => {
              const note = verificationNote(e, r)
              return (
                <li key={e.id}>
                  {e.citation}
                  {e.doi ? ` doi:${e.doi}` : ''}
                  {e.pmid ? ` PMID ${e.pmid}` : ''} <span className="rp-print-src">[{e.source === 'notebooklm' ? 'NotebookLM' : 'Base curada'}]</span>
                  {note && <span className="rp-print-src"> ({note})</span>}
                </li>
              )
            })}
          </ol>
        </>
      )}
      <h2>{t.aiDeclaration}</h2>
      <p className="rp-print-decl">{aiDeclarationFor(c, r)}</p>
      <h2>{t.validation}</h2>
      {r.status === 'validated' ? (
        <p>
          {t.validated}: <strong>{r.validatedBy}</strong>
          {r.validatorLicence ? ` (${t.licence} ${r.validatorLicence})` : ''} · {formatDateTime(r.validatedAt)}
          <br />
          SHA-256: <span className="mono">{r.contentHash}</span>
          <br />
          {t.localValidation}
        </p>
      ) : (
        <p>{t.notValidated}</p>
      )}
      <div className="rp-print-foot">
        {c.pseudoId} · {REPORT_STATE_LABEL[state]}
        {r.contentHash ? ` · SHA-256 ${r.contentHash.slice(0, 12)}…` : ''} · {t.generated}: {r.generatedBy}
        <br />
        {t.disclaimer}
      </div>
    </div>,
    document.body,
  )
}
