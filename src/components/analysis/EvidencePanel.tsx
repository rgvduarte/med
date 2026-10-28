import { useMemo, useState } from 'react'
import { BadgeCheck, ExternalLink, Info, Library, Notebook, TriangleAlert } from 'lucide-react'
import type { Case, EvidenceItem, Finding, NotebookLmAnswer, Report } from '../../types'
import { useSettings } from '../../store/settings'
import { citationNumbers } from '../../lib/report/format'
import { evidenceVerification, findingCode, findingsUsingEvidence, isVerified } from '../../lib/report/state'
import { evidenceTypeLabel } from '../../lib/labels-report'
import { AiTag, FindingClassChip } from '../report/StatusChips'

type Mode = 'all' | 'by-finding'
const MODE_KEY = 'mskvlm.evidence.mode'

function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'by-finding' ? 'by-finding' : 'all'
  } catch {
    return 'all'
  }
}

/** Where the report cites an evidence id: «Conclusão 1», «Achados · Osso», … */
function reportPlaces(r: Report | undefined, id: string): string[] {
  if (!r) return []
  const mark = `[${id}]`
  const out: string[] = []
  if (r.technique.includes(mark)) out.push('Técnica')
  for (const f of r.findingsByRegion) if (f.text.includes(mark)) out.push(`Achados · ${f.heading}`)
  r.impression.forEach((x, i) => x.includes(mark) && out.push(`Conclusão ${i + 1}`))
  if (r.recommendations.some((x) => x.includes(mark))) out.push('Recomendações')
  if (r.limitations.includes(mark)) out.push('Limitações')
  return out
}

function UsedIn({ c, findings, places, onSelectFinding }: { c: Case; findings: Finding[]; places: string[]; onSelectFinding?: (id: string) => void }) {
  if (!findings.length && !places.length) return null
  return (
    <div className="rp-used">
      <span className="rp-used-label">Usada em:</span>
      {findings.map((f) =>
        onSelectFinding ? (
          <button key={f.id} type="button" className="rp-fchip rp-fchip-btn" onClick={() => onSelectFinding(f.id)} title={`Ir para ${f.label}`}>
            {findingCode(c, f.id)}
          </button>
        ) : (
          <span key={f.id} className="rp-fchip" title={f.label}>
            {findingCode(c, f.id)}
          </span>
        ),
      )}
      {places.map((p) => (
        <span key={p} className="rp-place">
          {p}
        </span>
      ))}
    </div>
  )
}

function VerifyBadge({ e }: { e: EvidenceItem }) {
  const v = evidenceVerification(e)
  if (v.kind === 'unverified')
    return (
      <span className="rp-verify unverified">
        <TriangleAlert size={12} aria-hidden /> {v.label}
      </span>
    )
  if (v.kind === 'notebook')
    return (
      <span className="rp-verify notebook">
        <Notebook size={12} aria-hidden /> {v.label}
      </span>
    )
  return (
    <span className="rp-verify ok">
      <BadgeCheck size={12} aria-hidden /> {v.label}
    </span>
  )
}

function EvidenceCard({ c, e, n, onSelectFinding }: { c: Case; e: EvidenceItem; n?: number; onSelectFinding?: (id: string) => void }) {
  const type = evidenceTypeLabel(e.evidenceType)
  const unverified = !isVerified(e)
  const cited = n !== undefined
  return (
    <article className={`rp-ev ${unverified ? 'rp-ev-unverified' : ''}`}>
      <header className="rp-ev-head">
        <span className="rp-ev-id" title={e.id}>
          {n !== undefined ? `[${n}]` : `[${e.id}]`}
        </span>
        <span className="rp-ev-badges">
          {type && <span className="rp-type">{type}</span>}
          <VerifyBadge e={e} />
        </span>
      </header>
      <div className="rp-ev-title">{e.title}</div>
      <div className="rp-ev-cite">
        {e.citation}
        {e.year && !e.citation.includes(String(e.year)) ? ` (${e.year})` : ''}
      </div>
      {e.points.length > 0 && (
        <ul className="rp-ev-points">
          {e.points.map((p, i) => (
            <li key={i}>«{p}»</li>
          ))}
        </ul>
      )}
      {unverified && (
        <p className="rp-ev-note">
          {cited
            ? c.report?.status === 'validated'
              ? 'Citada no relatório validado; assumida pelo médico que validou.'
              : 'Citada no relatório; tem de ser assumida ou removida antes de validar.'
            : e.source === 'notebooklm'
              ? 'Texto de IA, não verificável — se o citar, terá de o assumir antes de validar.'
              : 'Sem DOI/PMID verificado — se a citar, terá de a assumir antes de validar.'}
        </p>
      )}
      <UsedIn c={c} findings={findingsUsingEvidence(c, e)} places={reportPlaces(c.report, e.id)} onSelectFinding={onSelectFinding} />
      <footer className="rp-ev-foot">
        <span className={`rp-src-badge ${e.source === 'notebooklm' ? 'nlm' : 'kb'}`}>
          {e.source === 'notebooklm' ? <Notebook size={11} aria-hidden /> : <Library size={11} aria-hidden />}
          {e.source === 'notebooklm' ? 'NotebookLM' : 'Base curada'}
        </span>
        <span className="rp-ev-links">
          {e.doi && (
            <a href={`https://doi.org/${e.doi}`} target="_blank" rel="noreferrer" aria-label={`Abrir DOI ${e.doi} (nova janela)`}>
              DOI <ExternalLink size={12} aria-hidden />
            </a>
          )}
          {e.pmid && (
            <a href={`https://pubmed.ncbi.nlm.nih.gov/${e.pmid}/`} target="_blank" rel="noreferrer" aria-label={`Abrir PubMed ${e.pmid} (nova janela)`}>
              PubMed <ExternalLink size={12} aria-hidden />
            </a>
          )}
          {!e.doi && !e.pmid && e.url && (
            <a href={e.url} target="_blank" rel="noreferrer">
              Fonte <ExternalLink size={12} aria-hidden />
            </a>
          )}
        </span>
      </footer>
    </article>
  )
}

function NotebookCard({ c, n, index, onSelectFinding }: { c: Case; n: NotebookLmAnswer; index: number; onSelectFinding?: (id: string) => void }) {
  const findings = (c.analysis?.findings ?? []).filter((f) => n.findingIds.includes(f.id))
  return (
    <article className="rp-nlm" aria-label={`Síntese NotebookLM ${index + 1}`}>
      <header className="rp-nlm-head">
        <span className="rp-nlm-title">
          <Notebook size={15} aria-hidden /> Síntese NotebookLM
        </span>
        <AiTag />
      </header>
      <p className="rp-nlm-note">Resposta gerada pelo NotebookLM a partir das fontes do caderno. É texto de IA: só as fontes citadas contam como evidência.</p>
      <div className="rp-nlm-answer">{n.answer}</div>
      {n.sources.length > 0 && (
        <div className="rp-nlm-sources">
          <div className="rp-used-label">Fontes citadas pelo caderno</div>
          <ol>
            {n.sources.map((s, j) => (
              <li key={j}>{s}</li>
            ))}
          </ol>
        </div>
      )}
      {n.sources.length === 0 && <p className="rp-ev-note">Sem citação de fontes do caderno — usar apenas como contexto.</p>}
      <details className="rp-nlm-q">
        <summary>Ver pergunta enviada</summary>
        <p>{n.question}</p>
      </details>
      <UsedIn c={c} findings={findings} places={[]} onSelectFinding={onSelectFinding} />
    </article>
  )
}

/**
 * Evidence tab (spec §1.8): NotebookLM syntheses in separate violet AI cards, curated-base and
 * notebook sources as evidence cards with neutral study-design badges and verification state.
 * `onSelectFinding` (optional) turns the «Usada em: F#» chips into links to the finding.
 */
export function EvidencePanel({ c, onSelectFinding }: { c: Case; onSelectFinding?: (findingId: string) => void }) {
  const mcpEnabled = useSettings((s) => s.mcpEnabled)
  const [mode, setMode] = useState<Mode>(loadMode)
  const a = c.analysis

  const numbers = useMemo(() => (c.report && a ? citationNumbers(c.report, a.evidence) : new Map<string, number>()), [c.report, a])

  const sorted = useMemo(() => {
    const list = [...(a?.evidence ?? [])]
    const rank = (e: EvidenceItem) => (numbers.has(e.id) ? numbers.get(e.id)! : evidenceVerification(e).kind === 'unverified' ? 10_000 : 1_000)
    return list.sort((x, y) => rank(x) - rank(y))
  }, [a, numbers])

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

  const setModeSaved = (m: Mode) => {
    setMode(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      /* per-viewer convenience only */
    }
  }

  const kbCount = a.evidence.filter((e) => e.source === 'kb').length
  const nlmCount = a.notebookLm.length + a.evidence.filter((e) => e.source === 'notebooklm').length

  const groups = (() => {
    if (mode !== 'by-finding') return []
    const used = new Set<string>()
    const out: { f?: Finding; nlm: { n: NotebookLmAnswer; i: number }[]; ev: EvidenceItem[] }[] = []
    for (const f of a.findings) {
      const ev = sorted.filter((e) => findingsUsingEvidence(c, e).some((x) => x.id === f.id))
      const nlm = a.notebookLm.map((n, i) => ({ n, i })).filter(({ n }) => n.findingIds.includes(f.id))
      if (!ev.length && !nlm.length) continue
      ev.forEach((e) => used.add(e.id))
      nlm.forEach(({ i }) => used.add(`nlm-${i}`))
      out.push({ f, ev, nlm })
    }
    const restEv = sorted.filter((e) => !used.has(e.id))
    const restNlm = a.notebookLm.map((n, i) => ({ n, i })).filter(({ i }) => !used.has(`nlm-${i}`))
    if (restEv.length || restNlm.length) out.push({ ev: restEv, nlm: restNlm })
    return out
  })()

  return (
    <div className="rp-evidence">
      <div className="rp-ev-bar">
        <div className="rp-seg" role="group" aria-label="Organização da evidência">
          <button type="button" aria-pressed={mode === 'all'} onClick={() => setModeSaved('all')}>
            Todas
          </button>
          <button type="button" aria-pressed={mode === 'by-finding'} onClick={() => setModeSaved('by-finding')}>
            Por achado
          </button>
        </div>
        <div className="rp-ev-legend" aria-label="Fontes">
          <span>
            <Notebook size={12} aria-hidden /> NotebookLM {nlmCount}
          </span>
          <span>
            <Library size={12} aria-hidden /> Base curada {kbCount}
          </span>
        </div>
      </div>

      {mcpEnabled && a.notebookLm.length === 0 && (
        <div className="callout callout-info">
          <Info size={16} />
          <div>NotebookLM indisponível ou sem resposta neste caso — a utilizar apenas a base curada.</div>
        </div>
      )}

      {mode === 'all' ? (
        <>
          {a.notebookLm.length > 0 && (
            <section className="rp-ev-section" aria-label="Sínteses do NotebookLM">
              {a.notebookLm.map((n, i) => (
                <NotebookCard key={i} c={c} n={n} index={i} onSelectFinding={onSelectFinding} />
              ))}
            </section>
          )}
          <section className="rp-ev-section" aria-labelledby="rp-ev-sources">
            <h3 id="rp-ev-sources" className="rp-ev-h">
              Fontes ({sorted.length})
            </h3>
            {sorted.map((e) => (
              <EvidenceCard key={e.id} c={c} e={e} n={numbers.get(e.id)} onSelectFinding={onSelectFinding} />
            ))}
          </section>
        </>
      ) : (
        groups.map((g, gi) => (
          <section key={g.f?.id ?? `rest-${gi}`} className="rp-ev-section" aria-label={g.f ? `Evidência de ${g.f.label}` : 'Sem achado associado'}>
            <h3 className="rp-ev-group">
              {g.f ? (
                <>
                  <span className="rp-fchip">{findingCode(c, g.f.id)}</span>
                  <span className="rp-ev-group-label">{g.f.label}</span>
                  <FindingClassChip cls={g.f.cls} />
                </>
              ) : (
                <span className="rp-ev-group-label">Sem achado associado</span>
              )}
            </h3>
            {g.nlm.map(({ n, i }) => (
              <NotebookCard key={`n${i}`} c={c} n={n} index={i} onSelectFinding={onSelectFinding} />
            ))}
            {g.ev.map((e) => (
              <EvidenceCard key={e.id} c={c} e={e} n={numbers.get(e.id)} onSelectFinding={onSelectFinding} />
            ))}
          </section>
        ))
      )}
    </div>
  )
}
