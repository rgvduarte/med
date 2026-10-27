import type { Report } from '../../types'

/** JSON with object keys sorted recursively and undefined values dropped (stable across runs). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** SHA-256 over the canonical JSON of the report, excluding the hash field itself. */
export async function reportContentHash(r: Report): Promise<string> {
  const { contentHash: _h, ...rest } = r
  return sha256Hex(canonicalJson(rest))
}

/** «9f3a…c21» */
export function shortHash(h: string | undefined): string {
  if (!h) return '—'
  return `${h.slice(0, 4)}…${h.slice(-3)}`
}
