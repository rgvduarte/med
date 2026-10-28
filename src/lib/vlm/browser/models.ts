// Registry of the built-in (in-browser) models and the device logic that picks one. Kept free of
// Transformers.js imports so the main bundle can use it (settings, download notices, crash recovery).
import type { BrowserModelSpec } from './protocol'

// Revisions are commit SHAs from https://huggingface.co/api/models/<id> so cached weights and code never drift.
// Keep all components of one path on the same float width: Transformers.js copies image features into the
// text embeddings with TypedArray.set, which is only value-correct across fp16/fp32 when Float16Array exists.
export const BROWSER_MODELS = {
  // Desktop default. Apache-2.0 (Qwen/Qwen3.5-2B), ungated. fp16 vision keeps the image encoder faithful.
  'qwen3.5-2b': {
    id: 'onnx-community/Qwen3.5-2B-ONNX-OPT',
    revision: 'ed446636739bf426e73c5a00714fd8e010d36c21', // 2026-10
    family: 'qwen',
    label: 'Qwen3.5 2B',
    licence: 'Apache-2.0',
    dtype: {
      f16: { embed_tokens: 'q4f16', vision_encoder: 'fp16', decoder_model_merged: 'q4f16' },
      f32: { embed_tokens: 'q4', vision_encoder: 'q4', decoder_model_merged: 'q4' },
    },
    downloadMb: { f16: 2070, f32: 1771 },
    maxImageSide: 768,
  },
  // Fallback for weaker computers. Apache-2.0, ungated.
  'qwen3.5-0.8b': {
    id: 'onnx-community/Qwen3.5-0.8B-ONNX-OPT',
    revision: '9a4c21d8f724176b0a7edaaed36303044451886e', // 2026-10-13
    family: 'qwen',
    label: 'Qwen3.5 0,8B',
    licence: 'Apache-2.0',
    dtype: {
      f16: { embed_tokens: 'q4f16', vision_encoder: 'fp16', decoder_model_merged: 'q4f16' },
      f32: { embed_tokens: 'q4', vision_encoder: 'fp32', decoder_model_merged: 'q4' },
    },
    downloadMb: { f16: 807, f32: 1070 },
    maxImageSide: 768,
  },
  // Phones and tablets: iOS kills a web page at about 1.5 GB, so only a ~0.3 GB model is realistic there.
  // LFM Open License v1.0 (free below US$10M annual revenue), ungated.
  'lfm2.5-vl-450m': {
    id: 'onnx-community/LFM2.5-VL-450M-ONNX',
    revision: '24e63007ff1aaafbde27c89eb01a0513f4f61482', // 2026-10
    family: 'lfm2-vl',
    label: 'LFM2.5-VL 450M',
    licence: 'LFM Open License v1.0',
    dtype: {
      f16: { embed_tokens: 'q4f16', vision_encoder: 'q4f16', decoder_model_merged: 'q4f16' },
      f32: { embed_tokens: 'q4', vision_encoder: 'q4', decoder_model_merged: 'q4' },
    },
    downloadMb: { f16: 319, f32: 368 },
    maxImageSide: 512,
  },
} satisfies Record<string, BrowserModelSpec>

export type BrowserModelKey = keyof typeof BROWSER_MODELS
export type BrowserModelSetting = BrowserModelKey | 'auto'

/** Largest first: where an automatic choice falls back after the device ran out of memory. */
const FALLBACK_ORDER: BrowserModelKey[] = ['qwen3.5-2b', 'qwen3.5-0.8b', 'lfm2.5-vl-450m']

export function isBrowserModelKey(v: string): v is BrowserModelKey {
  return v in BROWSER_MODELS
}

/** Phones and tablets, including iPadOS (which reports a Mac with a touch screen). */
export function isMobileDevice(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '', touchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0): boolean {
  return /iPhone|iPad|iPod|Android|Mobile/i.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)
}

export function isAppleMobile(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '', touchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)
}

// ---------------------------------------------------------------------------------------------------
// Out-of-memory recovery. iOS kills the page without any event when it runs out of memory, and reloads it
// when the user comes back. A marker written before loading/generating and removed afterwards (or on a
// normal page exit) therefore survives only such a kill; the next visit records it and steps down a size.

const INFLIGHT_KEY = 'mskvlm.browser.inflight'
const CRASH_KEY = 'mskvlm.browser.crashes'
/** A marker older than this was left by a tab closed long ago, not by a kill the user just saw. */
const CRASH_WINDOW_MS = 10 * 60 * 1000

function read<T>(key: string): T | undefined {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : undefined
  } catch {
    return undefined
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable: no recovery, nothing else breaks */
  }
}

export function markInFlight(model: BrowserModelKey, phase: 'load' | 'generate') {
  write(INFLIGHT_KEY, { model, phase, at: Date.now() })
}

export function clearInFlight() {
  write(INFLIGHT_KEY, undefined)
}

export function crashedModels(): Partial<Record<BrowserModelKey, number>> {
  return read<Partial<Record<BrowserModelKey, number>>>(CRASH_KEY) ?? {}
}

export function forgetCrashes() {
  write(CRASH_KEY, undefined)
}

/** The kill noticed at start-up, if any (for a one-time notice). */
export let lastCrash: { model: BrowserModelKey; phase: 'load' | 'generate' } | undefined

/** Call once at start-up: turns a marker left by a killed page into a crash record. */
export function recordCrashFromLastVisit(now = Date.now()) {
  const m = read<{ model: string; phase: 'load' | 'generate'; at: number }>(INFLIGHT_KEY)
  clearInFlight()
  if (!m || !isBrowserModelKey(m.model) || now - m.at > CRASH_WINDOW_MS) return
  const crashes = crashedModels()
  crashes[m.model] = (crashes[m.model] ?? 0) + 1
  write(CRASH_KEY, crashes)
  lastCrash = { model: m.model, phase: m.phase }
}

if (typeof window !== 'undefined') {
  // Leaving the page normally is not a crash.
  window.addEventListener('pagehide', clearInFlight)
}

/**
 * The model this device will use. «Automático» picks by device class and steps down after an
 * out-of-memory kill; an explicit choice is honoured as is. Undefined: every candidate crashed here.
 */
export function resolveBrowserModel(setting: string, crashes = crashedModels(), mobile = isMobileDevice()): BrowserModelKey | undefined {
  if (setting !== 'auto' && isBrowserModelKey(setting)) return setting
  const start = mobile ? FALLBACK_ORDER.indexOf('lfm2.5-vl-450m') : 0
  return FALLBACK_ORDER.slice(start).find((k) => !crashes[k])
}

export function downloadMb(key: BrowserModelKey, f16 = true): number {
  return BROWSER_MODELS[key].downloadMb[f16 ? 'f16' : 'f32']
}

/** «2,1 GB» / «319 MB» */
export function formatMb(mb: number): string {
  return mb >= 1000 ? `${(mb / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} GB` : `${mb} MB`
}

/** True when Cache Storage already holds weights of this exact model revision. */
export async function isModelCached(key: BrowserModelKey): Promise<boolean> {
  try {
    if (!('caches' in globalThis) || !(await caches.has('transformers-cache'))) return false
    const spec = BROWSER_MODELS[key]
    const cache = await caches.open('transformers-cache')
    const needle = `${spec.id}/resolve/${spec.revision}/onnx/`
    return (await cache.keys()).some((r) => r.url.includes(needle))
  } catch {
    return false
  }
}
