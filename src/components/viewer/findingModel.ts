// Pure helpers shared by the viewer, the findings panel and the workspace.
import type { Case, Finding, FindingLocation, Series } from '../../types'

/** Stable display codes: F1…Fn over priority then other findings (checklist items get none). */
export function findingCodes(findings: Finding[]): Map<string, string> {
  const codes = new Map<string, string>()
  let n = 0
  for (const g of ['priority', 'other'] as const) {
    for (const f of findings) if (f.group === g) codes.set(f.id, `F${++n}`)
  }
  return codes
}

/** Findings the clinician steps through with N / Shift+N: reviewable and not rejected, in code order. */
export function navigableFindings(findings: Finding[], codes: Map<string, string>): Finding[] {
  return findings
    .filter((f) => f.group !== 'checklist' && f.status !== 'rejected' && codes.has(f.id))
    .sort((a, b) => Number(codes.get(a.id)!.slice(1)) - Number(codes.get(b.id)!.slice(1)))
}

/** Positive and doubtful findings are drawn on the image; negative / not assessable never are. */
export function isDrawable(f: Finding): boolean {
  return f.group !== 'checklist' && f.status !== 'rejected' && (f.cls === 'positive' || f.cls === 'doubtful')
}

/** The location to navigate to: the first one with a box, else the first one. */
export function primaryLocation(f: Finding, series: Series[]): FindingLocation | undefined {
  const valid = f.locations.filter((l) => series.some((s) => s.id === l.seriesId))
  return valid.find((l) => l.bbox) ?? valid[0]
}

/** Study-level AI result: one shared rule with the worklist (see lib/report/state). */
export { studyClass } from '../../lib/report/state'

export function reviewProgress(findings: Finding[]) {
  const reviewable = findings.filter((f) => f.group !== 'checklist')
  const pending = reviewable.filter((f) => f.status === 'pending')
  return { total: reviewable.length, reviewed: reviewable.length - pending.length, pending }
}

export function isLocked(c: Case): boolean {
  return c.status === 'validated' || c.report?.status === 'validated'
}

/** Per-series AI glyph: ■ positives, ▭ doubtfuls, ○ analysed and negative, · not analysed. */
export function seriesAiStatus(c: Case, seriesId: string): { kind: 'positive' | 'doubtful' | 'negative' | 'none'; count: number } {
  const a = c.analysis
  if (!a || (!a.finishedAt && a.findings.length === 0)) return { kind: 'none', count: 0 }
  const here = a.findings.filter((f) => isDrawable(f) && f.locations.some((l) => l.seriesId === seriesId))
  const pos = here.filter((f) => f.cls === 'positive').length
  if (pos) return { kind: 'positive', count: pos }
  const dub = here.filter((f) => f.cls === 'doubtful').length
  if (dub) return { kind: 'doubtful', count: dub }
  return { kind: 'negative', count: 0 }
}

/** A finding's frame range in ascending order (the model may emit [last, first]). */
export function orderedRange(r: [number, number]): [number, number] {
  return r[0] <= r[1] ? r : [r[1], r[0]]
}

/** Range the cine player can loop over: a single-frame (or empty) range is not a loop. */
export function playableLoop(r: [number, number] | undefined, frameCount: number): [number, number] | undefined {
  if (!r || frameCount < 2) return undefined
  const last = frameCount - 1
  const [lo, hi] = orderedRange(r).map((i) => Math.min(last, Math.max(0, i))) as [number, number]
  return lo < hi ? [lo, hi] : undefined
}

/** Normalised position (0..1) of a frame on the cine timeline. */
export function framePosition(series: Series, index: number): number {
  const n = series.frames.length
  if (n <= 1) return 0
  const t = series.frames[index]?.timeSec
  const total = seriesDuration(series)
  if (t !== undefined && total && total > 0) return Math.min(1, Math.max(0, t / total))
  return index / (n - 1)
}

export function seriesDuration(series: Series): number | undefined {
  if (series.durationSec && series.durationSec > 0) return series.durationSec
  const last = series.frames[series.frames.length - 1]?.timeSec
  return last !== undefined && last > 0 ? last : undefined
}
