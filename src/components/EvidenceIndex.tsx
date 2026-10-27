import { useMemo, useState } from 'react'
import { ExternalLink, Search } from 'lucide-react'
import { KB, type KbEntry } from '../lib/evidence/kb'
import { REGION_LABEL } from '../lib/labels'
import type { Region } from '../types'

const TYPE_LABEL: Record<string, string> = {
  guideline: 'Guideline',
  'systematic-review/meta-analysis': 'Revisão sistemática',
  'prospective-diagnostic-accuracy': 'Estudo diagnóstico prospetivo',
  'retrospective-diagnostic-accuracy': 'Estudo diagnóstico retrospetivo',
  'classification-system': 'Classificação',
  'narrative-review': 'Revisão narrativa',
  'consensus/position-paper': 'Consenso',
  other: 'Outro',
}

function groupOf(e: KbEntry): string {
  const r = e.regions.find((x) => x !== 'any') as Region | undefined
  return r ? REGION_LABEL[r] : 'Geral / IA e relatório'
}

/** Browsable index of the curated, verified evidence base (Method page). */
export function EvidenceIndex() {
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = KB.filter((e) => !s || [e.title, e.authors, e.journal, e.topic, ...e.keywords].join(' ').toLowerCase().includes(s))
    const map = new Map<string, KbEntry[]>()
    for (const e of list) map.set(groupOf(e), [...(map.get(groupOf(e)) ?? []), e])
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt'))
  }, [q])

  return (
    <details className="card card-pad" style={{ marginTop: 'var(--sp-3)' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text)' }}>Índice da base curada — {KB.length} referências verificadas</summary>
      <div className="row" style={{ gap: 6, margin: 'var(--sp-3) 0', flexWrap: 'nowrap' }}>
        <Search size={16} className="subtle" aria-hidden />
        <input className="input" placeholder="Filtrar por título, autor, revista ou palavra-chave…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrar referências" />
      </div>
      {groups.map(([g, items]) => (
        <section key={g} style={{ marginBottom: 'var(--sp-4)' }}>
          <h3 style={{ fontSize: 'var(--fs-sm)', margin: '0 0 6px', color: 'var(--text)' }}>
            {g} <span className="subtle">({items.length})</span>
          </h3>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--fs-sm)' }}>
            {items
              .sort((a, b) => b.year - a.year)
              .map((e) => (
                <li key={e.id} style={{ marginBottom: 6 }}>
                  {e.authors} {e.title} <em>{e.journal}</em>. {e.year}.{' '}
                  <span className="badge badge-neutral">{TYPE_LABEL[e.evidence_type] ?? e.evidence_type}</span>{' '}
                  {e.doi && (
                    <a href={`https://doi.org/${e.doi}`} target="_blank" rel="noreferrer">
                      doi:{e.doi} <ExternalLink size={11} aria-hidden />
                    </a>
                  )}
                  {e.pmid && (
                    <>
                      {' · '}
                      <a href={`https://pubmed.ncbi.nlm.nih.gov/${e.pmid}/`} target="_blank" rel="noreferrer">
                        PMID {e.pmid}
                      </a>
                    </>
                  )}
                </li>
              ))}
          </ol>
        </section>
      ))}
    </details>
  )
}
