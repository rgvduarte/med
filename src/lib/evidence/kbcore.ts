import type { EvidenceItem, Finding, Modality, Region, ReportLanguage, Triage } from '../../types'

/** One verified reference of the curated evidence base (PubMed/Crossref-checked). */
export interface KbEntry {
  id: string
  topic: string
  authors: string
  title: string
  journal: string
  year: number
  doi: string
  pmid: string
  url: string
  evidence_type: string
  key_points: string[]
  key_points_pt: string[]
  modalities: string[]
  regions: string[]
  keywords: string[]
  abstract_excerpt?: string
}


const STOP = new Set(
  'a o as os de da do das dos e em no na nos nas um uma com por para sem the of and in on for with without to or at by is are be from imaging image images'.split(' '),
)

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t))
}

export function citationOf(e: KbEntry): string {
  return `${e.authors}. ${e.title} ${e.journal}. ${e.year}.`
}

const TYPE_BONUS: Record<string, number> = {
  guideline: 1.5,
  'systematic-review/meta-analysis': 1.5,
  'consensus/position-paper': 1.2,
  'classification-system': 1.2,
  'prospective-diagnostic-accuracy': 1,
}

export function scoreEntry(e: KbEntry, query: string[], region?: Region, modality?: Modality): number {
  const q = new Set(query)
  if (!q.size) return 0
  const field = (arr: string[], w: number) => {
    let s = 0
    const seen = new Set<string>()
    for (const t of arr) if (q.has(t) && !seen.has(t)) {
      seen.add(t)
      s += w
    }
    return s
  }
  let s =
    field(tokens(e.keywords.join(' ')), 3) +
    field(tokens(e.title), 2) +
    field(tokens(e.topic), 1.5) +
    field(tokens(e.key_points.join(' ') + ' ' + e.key_points_pt.join(' ')), 0.6)
  if (s === 0) return 0
  if (region && region !== 'other') {
    // Evidence about another anatomical region never supports this finding.
    if (e.regions.includes(region)) s += 3
    else if (!e.regions.includes('any')) return 0
  }
  if (modality) {
    const m = modality === 'XA' ? 'XR' : modality
    if (e.modalities.includes(m)) s += 1.5
    else if (!e.modalities.includes('any')) s -= 1.5
  }
  return s + (TYPE_BONUS[e.evidence_type] ?? 0)
}

export function findingQuery(f: Pick<Finding, 'label' | 'anatomicSite' | 'evidenceQuery' | 'classification'>): string[] {
  return tokens([f.label, f.anatomicSite, f.classification?.system ?? '', ...f.evidenceQuery].join(' '))
}

function toItem(e: KbEntry, lang: ReportLanguage, findingIds: string[], score: number): EvidenceItem {
  return {
    id: e.id,
    source: 'kb',
    title: e.title,
    citation: citationOf(e),
    url: e.url,
    doi: e.doi || undefined,
    pmid: e.pmid || undefined,
    year: e.year,
    evidenceType: e.evidence_type,
    points: lang === 'pt-PT' && e.key_points_pt.length ? e.key_points_pt : e.key_points,
    findingIds,
    score,
  }
}

/**
 * Deterministic retrieval from the curated base: top-k references per finding plus a
 * small set of method references (VLM limitations / reporting) for the limitations section.
 */
export function retrieveFrom(KB: KbEntry[], findings: Finding[], triage: Triage | undefined, lang: ReportLanguage, perFinding = 3): EvidenceItem[] {
  const byId = new Map<string, EvidenceItem>()
  const add = (e: KbEntry, fid: string | null, score: number) => {
    const cur = byId.get(e.id)
    if (cur) {
      if (fid && !cur.findingIds.includes(fid)) cur.findingIds.push(fid)
      cur.score = Math.max(cur.score ?? 0, score)
    } else byId.set(e.id, toItem(e, lang, fid ? [fid] : [], score))
  }
  for (const f of findings) {
    if (f.cls === 'negative' || f.status === 'rejected') continue
    const q = findingQuery(f)
    const ranked = KB.map((e) => [e, scoreEntry(e, q, triage?.region, triage?.modality)] as const)
      .filter(([, s]) => s >= 6)
      .sort((a, b) => b[1] - a[1])
      .slice(0, perFinding)
    for (const [e, s] of ranked) add(e, f.id, s)
  }
  const methodQ = tokens('vision language model multimodal large language model radiology accuracy hallucination automation bias structured reporting')
  KB.filter((e) => e.regions.includes('any'))
    .map((e) => [e, scoreEntry(e, methodQ)] as const)
    .filter(([, s]) => s >= 6)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .forEach(([e, s]) => add(e, null, s))
  return [...byId.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
}
