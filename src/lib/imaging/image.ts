import type { Frame } from '../../types'
import { uid } from '../util'

export function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Não foi possível abrir a imagem (${src.slice(0, 60)})`))
    img.src = src
  })
}

/** Loads a PNG/JPEG/WebP file as a single frame. The pixels stay in the browser. */
export async function loadImageFile(file: File): Promise<Frame> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadHtmlImage(url)
    return { id: uid('fr'), index: 0, url, width: img.naturalWidth, height: img.naturalHeight }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

export async function loadImageUrl(url: string): Promise<Frame> {
  const img = await loadHtmlImage(url)
  return { id: uid('fr'), index: 0, url, width: img.naturalWidth, height: img.naturalHeight }
}
