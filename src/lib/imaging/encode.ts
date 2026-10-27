import type { Frame } from '../../types'
import { loadHtmlImage } from './image'

export interface EncodedImage {
  mediaType: 'image/jpeg' | 'image/png'
  base64: string
  width: number
  height: number
}

/**
 * Re-encodes a frame for VLM input. Claude's vision guidance: images whose long edge
 * exceeds ~1568 px are downscaled server-side anyway, so we resize locally to save
 * upload size and tokens. Greyscale radiographs survive JPEG q=0.92 well.
 */
export async function encodeFrame(frame: Frame, maxLongEdge = 1568, mediaType: EncodedImage['mediaType'] = 'image/jpeg'): Promise<EncodedImage> {
  const img = await loadHtmlImage(frame.url)
  const w = img.naturalWidth
  const h = img.naturalHeight
  const scale = Math.min(1, maxLongEdge / Math.max(w, h))
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, cw, ch)
  ctx.drawImage(img, 0, 0, cw, ch)
  const dataUrl = canvas.toDataURL(mediaType, 0.92)
  return { mediaType, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), width: cw, height: ch }
}
