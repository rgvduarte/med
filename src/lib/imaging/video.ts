import type { Frame } from '../../types'
import { uid } from '../util'

export interface KeyframeOptions {
  /** Maximum keyframes kept for display and VLM input. */
  maxFrames: number
  /** Long edge of the rendered keyframes in pixels. */
  maxLongEdge?: number
  /** Number of candidate timestamps scanned for scene changes. */
  candidates?: number
  onProgress?: (done: number, total: number) => void
}

export interface VideoLoadResult {
  videoUrl: string
  durationSec: number
  width: number
  height: number
  frames: Frame[]
}

function once(el: HTMLMediaElement, event: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup()
      reject(new Error(`Tempo esgotado à espera de "${event}" no vídeo`))
    }, timeoutMs)
    const ok = () => {
      cleanup()
      resolve()
    }
    const fail = () => {
      cleanup()
      reject(new Error('O navegador não consegue descodificar este vídeo (experimente MP4/H.264 ou WebM).'))
    }
    const cleanup = () => {
      clearTimeout(t)
      el.removeEventListener(event, ok)
      el.removeEventListener('error', fail)
    }
    el.addEventListener(event, ok, { once: true })
    el.addEventListener('error', fail, { once: true })
  })
}

/**
 * Clips recorded with MediaRecorder (WebM) carry no duration in their header, so the browser reports
 * Infinity. Seeking far past the end makes it scan the file and report the real duration.
 */
async function resolveDuration(video: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(video.duration)) return Math.max(0, video.duration)
  try {
    const p = once(video, 'seeked')
    video.currentTime = 1e9
    await p
  } catch {
    // timed out or failed: checked below
  }
  if (!Number.isFinite(video.duration)) {
    throw new Error('Duração do vídeo desconhecida (comum em gravações WebM do navegador) — reexporte o clip como MP4 (H.264) e volte a carregar.')
  }
  return Math.max(0, video.duration)
}

/** Drops candidate indices whose timestamps coincide (very short clips), keeping the first of each. */
export function distinctTimes(indices: number[], times: number[]): number[] {
  const seen: number[] = []
  return indices.filter((i) => {
    if (seen.some((t) => Math.abs(t - times[i]) < 1e-3)) return false
    seen.push(times[i])
    return true
  })
}

async function seek(video: HTMLVideoElement, t: number) {
  if (Math.abs(video.currentTime - t) < 1e-3) return
  const p = once(video, 'seeked')
  video.currentTime = t
  await p
}

/** Grey-level signature (32×32) used to measure visual change between candidates. */
function signature(ctx: CanvasRenderingContext2D, video: HTMLVideoElement): Float32Array {
  ctx.drawImage(video, 0, 0, 32, 32)
  const d = ctx.getImageData(0, 0, 32, 32).data
  const out = new Float32Array(32 * 32)
  for (let i = 0; i < out.length; i++) out[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255
  return out
}

function meanAbsDiff(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i])
  return s / a.length
}

/**
 * Extracts representative keyframes from a clip entirely in the browser:
 * uniform temporal coverage (first/last + evenly spaced) plus the frames with
 * the largest visual change (probe movement, dynamic manoeuvres), capped at maxFrames.
 */
export async function extractKeyframes(src: string, opts: KeyframeOptions): Promise<VideoLoadResult> {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.crossOrigin = 'anonymous'
  video.src = src
  await once(video, 'loadeddata', 15000)

  const duration = await resolveDuration(video)
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) throw new Error('Vídeo sem dimensões válidas.')

  const maxFrames = Math.max(1, Math.min(32, opts.maxFrames))
  const nCand = Math.max(maxFrames, Math.min(opts.candidates ?? 48, Math.ceil(duration * 6) || maxFrames))
  const eps = Math.min(0.05, duration / 100)
  const times = Array.from({ length: nCand }, (_, i) =>
    nCand === 1 ? 0 : eps + (i * Math.max(0, duration - 2 * eps)) / (nCand - 1),
  )

  const sigCanvas = document.createElement('canvas')
  sigCanvas.width = 32
  sigCanvas.height = 32
  const sigCtx = sigCanvas.getContext('2d', { willReadFrequently: true })!

  const sigs: Float32Array[] = []
  for (let i = 0; i < times.length; i++) {
    await seek(video, times[i])
    sigs.push(signature(sigCtx, video))
    opts.onProgress?.(i + 1, times.length + maxFrames)
  }

  const change = sigs.map((s, i) => (i === 0 ? 0 : meanAbsDiff(s, sigs[i - 1])))
  const chosen = new Set<number>()
  const uniformCount = Math.max(2, Math.ceil(maxFrames / 2))
  for (let k = 0; k < uniformCount && chosen.size < maxFrames; k++) {
    chosen.add(Math.round((k * (times.length - 1)) / Math.max(1, uniformCount - 1)))
  }
  const byChange = change.map((c, i) => [c, i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of byChange) {
    if (chosen.size >= maxFrames) break
    // keep chosen frames at least two candidates apart to avoid near-duplicates
    if ([...chosen].every((j) => Math.abs(j - i) >= 2)) chosen.add(i)
  }
  const picked = distinctTimes([...chosen].sort((a, b) => a - b), times)

  const maxEdge = opts.maxLongEdge ?? 1280
  const scale = Math.min(1, maxEdge / Math.max(w, h))
  const cw = Math.round(w * scale)
  const ch = Math.round(h * scale)
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')!

  const frames: Frame[] = []
  for (let k = 0; k < picked.length; k++) {
    const t = times[picked[k]]
    await seek(video, t)
    ctx.drawImage(video, 0, 0, cw, ch)
    frames.push({ id: uid('fr'), index: k, timeSec: t, url: canvas.toDataURL('image/jpeg', 0.9), width: cw, height: ch })
    opts.onProgress?.(times.length + k + 1, times.length + maxFrames)
  }

  video.removeAttribute('src')
  video.load()
  return { videoUrl: src, durationSec: duration, width: w, height: h, frames }
}
