import type { EvidenceItem } from '../../types'

const SPLIT_RE = /(\[[A-Za-z0-9._-]+\])/g
const MARK_RE = /^\[([A-Za-z0-9._-]+)\]$/

/** Scrolls to a reference entry inside the report (hash links would clash with the router). */
function scrollToRef(scope: string, id: string) {
  const el = document.getElementById(`${scope}-ref-${id}`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('rp-flash')
  setTimeout(() => el.classList.remove('rp-flash'), 1200)
}

/**
 * Renders "[id]" markers: evidence ids become numbered citation buttons ([n], Vancouver order),
 * finding codes ([F1]) become finding chips, anything else is left as typed.
 */
export function Cited({
  text,
  numbers,
  evidence,
  scope,
  findingLabel,
}: {
  text: string
  numbers: Map<string, number>
  evidence: EvidenceItem[]
  scope: string
  findingLabel?: (code: string) => string | undefined
}) {
  const parts = text.split(SPLIT_RE)
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(MARK_RE)
        if (!m) return p ? <span key={i}>{p}</span> : null
        const id = m[1]
        const n = numbers.get(id)
        if (n !== undefined) {
          const e = evidence.find((x) => x.id === id)
          return (
            <button key={i} type="button" className="rp-cite" onClick={() => scrollToRef(scope, id)} title={e ? e.citation : id} aria-label={`Referência ${n}: ${e?.title ?? id}`}>
              [{n}]
            </button>
          )
        }
        if (/^F\d+$/.test(id)) {
          const label = findingLabel?.(id)
          return (
            <span key={i} className="rp-fchip" title={label ?? `Achado ${id}`}>
              {id}
            </span>
          )
        }
        return <span key={i}>{p}</span>
      })}
    </>
  )
}
