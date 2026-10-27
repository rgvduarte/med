import type { Frame } from '../../types'
import { loadHtmlImage } from './image'

export interface EncodedImage {
  mediaType: 'image/jpeg' | 'image/png'
  base64: string
  width: number
  height: number
  /** Where the original picture sits inside the encoded image [x, y, w, h] in pixels (differs only when padded). */
  content: [number, number, number, number]
}

/**
 * Re-encodes a frame for VLM input. Claude's vision guidance: images whose long edge
 * exceeds ~1568 px are downscaled server-side anyway, so we resize locally to save
 * upload size and tokens. Greyscale radiographs survive JPEG q=0.92 well.
 */
export async function encodeFrame(
  frame: Frame,
  maxLongEdge = 1568,
  mediaType: EncodedImage['mediaType'] = 'image/jpeg',
  padSquare = false,
): Promise<EncodedImage> {
  const img = await loadHtmlImage(frame.url)
  const w = img.naturalWidth
  const h = img.naturalHeight
  const scale = Math.min(1, maxLongEdge / Math.max(w, h))
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))
  // Gemma-3-family encoders (MedGemma via llama.cpp/Ollama) letterbox to a square internally; padding here
  // makes that explicit so the boxes the model returns can be mapped back exactly.
  const W = padSquare ? Math.max(cw, ch) : cw
  const H = padSquare ? Math.max(cw, ch) : ch
  const ox = Math.floor((W - cw) / 2)
  const oy = Math.floor((H - ch) / 2)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  ctx.drawImage(img, ox, oy, cw, ch)
  const dataUrl = canvas.toDataURL(mediaType, 0.92)
  return { mediaType, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), width: W, height: H, content: [ox, oy, cw, ch] }
}
