import { BookMarked, ExternalLink, Library, MessageSquareQuote } from 'lucide-react'
import type { Case } from '../../types'

export function EvidencePanel({ c }: { c: Case }) {
  const a = c.analysis
  if (!a || (a.evidence.length === 0 && a.notebookLm.length === 0)) {
    return (
      <div className="empty">
        <Library size={26} aria-hidden />
        <div>
          A evidência aparece aqui depois da análise: artigos revistos por pares da base curada e, se ligado, respostas do seu caderno
          NotebookLM.
        </div>
      </div>
    )
  }
  const findingLabel = (id: string) => {
    const i = a.findings.findIndex((f) => f.id === id)
    return i >= 0 ? `#${i + 1}` : ''
  }
  return (
    <div>
      {a.notebookLm.length > 0 && (
        <section style={{ marginBottom: 'var(--sp-4)' }}>
          <h3 className="row" style={{ fontSize: 'var(--fs-sm)', marginBottom: 8, gap: 6 }}>
            <MessageSquareQuote size={15} /> NotebookLM (via MCP)
          </h3>
          {a.notebookLm.map((n, i) => (
            <div key={i} className="evidence">
              <div className="evidence-id">NLM-{i + 1}</div>
              <div style={{ fontWeight: 600, margin: '2px 0 4px' }}>{n.question}</div>
              <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>{n.answer}</div>
              {n.sources.length > 0 && (
                <ul>
                  {n.sources.map((s, j) => (
                    <li key={j}>{s}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}
      <section>
        <h3 className="row" style={{ fontSize: 'var(--fs-sm)', marginBottom: 8, gap: 6 }}>
          <BookMarked size={15} /> Base de evidência curada (verificada no PubMed)
        </h3>
        {a.evidence
          .filter((e) => e.source === 'kb')
          .map((e) => (
            <div key={e.id} className="evidence">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="evidence-id">[{e.id}]</span>
                <span className="row" style={{ gap: 4 }}>
                  {e.findingIds.map((fid) => (
                    <span key={fid} className="badge badge-neutral">
                      {findingLabel(fid)}
                    </span>
                  ))}
                  {e.evidenceType && <span className="badge badge-info">{e.evidenceType}</span>}
                </span>
              </div>
              <div style={{ fontWeight: 600, margin: '4px 0 2px' }}>{e.title}</div>
              <div className="subtle" style={{ fontSize: 'var(--fs-xs)' }}>{e.citation}</div>
              <ul>
                {e.points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
              <div className="row" style={{ gap: 12, marginTop: 6, fontSize: 'var(--fs-xs)' }}>
                {e.doi && (
                  <a href={`https://doi.org/${e.doi}`} target="_blank" rel="noreferrer" className="row" style={{ gap: 4 }}>
                    DOI <ExternalLink size={12} />
                  </a>
                )}
                {e.pmid && (
                  <a href={`https://pubmed.ncbi.nlm.nih.gov/${e.pmid}/`} target="_blank" rel="noreferrer" className="row" style={{ gap: 4 }}>
                    PubMed {e.pmid} <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
          ))}
      </section>
    </div>
  )
}
