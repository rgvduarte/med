import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Contrast,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Maximize,
  Move,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Ruler,
  SunMoon,
  Video,
  ZoomIn,
} from 'lucide-react'
import type { Frame, Series } from '../../types'
import { renderWindowed } from '../../lib/imaging/dicom'
import { loadHtmlImage } from '../../lib/imaging/image'
import { clamp, formatTime } from '../../lib/util'
import { MODALITY_LABEL, REGION_LABEL } from '../../lib/labels'

export interface OverlayBox {
  id: string
  bbox: [number, number, number, number]
  label: string
  color: string
  selected?: boolean
  dashed?: boolean
}

type Tool = 'pan' | 'zoom' | 'wl' | 'length'

interface Measurement {
  id: string
  frameId: string
  a: [number, number]
  b: [number, number]
}

interface ViewState {
  zoom: number // relative to fit
  panX: number
  panY: number
  rotation: 0 | 90 | 180 | 270
  flipH: boolean
  flipV: boolean
  invert: boolean
  wc: number
  ww: number
}

interface Props {
  series: Series | undefined
  frameIndex: number
  onFrameIndex: (i: number) => void
  overlays: OverlayBox[]
  onSelectOverlay?: (id: string) => void
  cornerTopLeft?: string
  cornerBottomRight?: string
}

function defaultWindow(frame: Frame | undefined): [number, number] {
  if (frame?.raw) return [frame.raw.windowCenter, frame.raw.windowWidth]
  return [127.5, 256]
}

export function Viewer({ series, frameIndex, onFrameIndex, overlays, onSelectOverlay, cornerTopLeft, cornerBottomRight }: Props) {
  const frame = series?.frames[frameIndex]
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const srcRef = useRef<{ frameId: string; data: ImageData } | null>(null)
  const procRef = useRef<HTMLCanvasElement | null>(null)
  const [tool, setTool] = useState<Tool>('pan')
  const [showOverlays, setShowOverlays] = useState(true)
  const [showClip, setShowClip] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [draft, setDraft] = useState<Measurement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<ViewState>(() => {
    const [wc, ww] = defaultWindow(frame)
    return { zoom: 1, panX: 0, panY: 0, rotation: 0, flipH: false, flipV: false, invert: false, wc, ww }
  })
  const [, setTick] = useState(0)

  // Reset view when the series changes.
  useEffect(() => {
    const [wc, ww] = defaultWindow(series?.frames[0])
    setView({ zoom: 1, panX: 0, panY: 0, rotation: 0, flipH: false, flipV: false, invert: false, wc, ww })
    setMeasurements([])
    setShowClip(false)
    setPlaying(false)
  }, [series?.id])

  // Track viewport size.
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // Load source pixels for the current frame.
  useEffect(() => {
    let cancelled = false
    if (!frame) return
    if (frame.raw) {
      srcRef.current = null
      setTick((t) => t + 1)
      return
    }
    loadHtmlImage(frame.url)
      .then((img) => {
        if (cancelled) return
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        const ctx = c.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(img, 0, 0)
        srcRef.current = { frameId: frame.id, data: ctx.getImageData(0, 0, c.width, c.height) }
        setTick((t) => t + 1)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [frame])

  // Cine playback.
  useEffect(() => {
    if (!playing || !series || series.frames.length < 2) return
    const t = setInterval(() => onFrameIndex((frameIndex + 1) % series.frames.length), 350)
    return () => clearInterval(t)
  }, [playing, frameIndex, series, onFrameIndex])

  const imgW = frame?.raw ? frame.raw.columns : (srcRef.current?.data.width ?? frame?.width ?? 1)
  const imgH = frame?.raw ? frame.raw.rows : (srcRef.current?.data.height ?? frame?.height ?? 1)

  const baseScale = useMemo(() => {
    const rotated = view.rotation === 90 || view.rotation === 270
    const w = rotated ? imgH : imgW
    const h = rotated ? imgW : imgH
    if (!size.w || !size.h) return 1
    return Math.min(size.w / w, size.h / h) * 0.96
  }, [size, imgW, imgH, view.rotation])

  const matrix = useMemo(() => {
    const s = baseScale * view.zoom
    const m = new DOMMatrix()
      .translate(size.w / 2 + view.panX, size.h / 2 + view.panY)
      .rotate(view.rotation)
      .scale(view.flipH ? -s : s, view.flipV ? -s : s)
      .translate(-imgW / 2, -imgH / 2)
    return m
  }, [baseScale, view, size, imgW, imgH])

  // Render processed (windowed/inverted) image into an offscreen canvas.
  const processed = useMemo(() => {
    if (!frame) return null
    const raw = frame.raw
    const src = srcRef.current?.frameId === frame.id ? srcRef.current.data : null
    if (!raw && !src) return null
    const w = raw ? raw.columns : src!.width
    const h = raw ? raw.rows : src!.height
    const c = procRef.current ?? document.createElement('canvas')
    procRef.current = c
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    const out = ctx.createImageData(w, h)
    if (raw) {
      renderWindowed(raw, view.wc, view.ww, raw.invert !== view.invert, out.data)
    } else {
      const lo = view.wc - view.ww / 2
      const lut = new Uint8ClampedArray(256)
      for (let i = 0; i < 256; i++) {
        let g = ((i - lo) / view.ww) * 255
        g = clamp(g, 0, 255)
        lut[i] = view.invert ? 255 - g : g
      }
      const d = src!.data
      for (let i = 0; i < d.length; i += 4) {
        out.data[i] = lut[d[i]]
        out.data[i + 1] = lut[d[i + 1]]
        out.data[i + 2] = lut[d[i + 2]]
        out.data[i + 3] = 255
      }
    }
    ctx.putImageData(out, 0, 0)
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, view.wc, view.ww, view.invert, srcRef.current])

  // Draw.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.w) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size.w * dpr)
    canvas.height = Math.round(size.h * dpr)
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, size.w, size.h)
    if (!processed || !frame) return
    const s = baseScale * view.zoom
    ctx.save()
    ctx.setTransform(new DOMMatrix([dpr, 0, 0, dpr, 0, 0]).multiply(matrix))
    ctx.imageSmoothingEnabled = s < 3
    ctx.drawImage(processed, 0, 0)
    ctx.restore()

    const toScreen = (x: number, y: number) => {
      const p = matrix.transformPoint(new DOMPoint(x, y))
      return [p.x, p.y] as const
    }

    if (showOverlays) {
      for (const o of overlays) {
        const [x, y, w, h] = o.bbox
        const pts = [
          toScreen(x * imgW, y * imgH),
          toScreen((x + w) * imgW, y * imgH),
          toScreen((x + w) * imgW, (y + h) * imgH),
          toScreen(x * imgW, (y + h) * imgH),
        ]
        ctx.save()
        ctx.strokeStyle = o.color
        ctx.lineWidth = o.selected ? 3 : 2
        ctx.setLineDash(o.dashed ? [6, 4] : [])
        ctx.shadowColor = 'rgba(0,0,0,0.9)'
        ctx.shadowBlur = 3
        ctx.beginPath()
        pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)))
        ctx.closePath()
        ctx.stroke()
        const minX = Math.min(...pts.map((p) => p[0]))
        const minY = Math.min(...pts.map((p) => p[1]))
        ctx.font = '600 12px Inter Variable, system-ui, sans-serif'
        const tw = ctx.measureText(o.label).width
        const ly = minY > 20 ? minY - 18 : minY + 2
        ctx.shadowBlur = 0
        ctx.fillStyle = 'rgba(0,0,0,0.72)'
        ctx.fillRect(minX, ly, tw + 10, 17)
        ctx.fillStyle = o.color
        ctx.fillText(o.label, minX + 5, ly + 13)
        ctx.restore()
      }
    }

    const all = [...measurements.filter((m) => m.frameId === frame.id), ...(draft ? [draft] : [])]
    for (const m of all) {
      const a = toScreen(m.a[0], m.a[1])
      const b = toScreen(m.b[0], m.b[1])
      ctx.save()
      ctx.strokeStyle = '#40e0ff'
      ctx.fillStyle = '#40e0ff'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(b[0], b[1])
      ctx.stroke()
      for (const p of [a, b]) {
        ctx.beginPath()
        ctx.arc(p[0], p[1], 3, 0, Math.PI * 2)
        ctx.fill()
      }
      const dx = m.b[0] - m.a[0]
      const dy = m.b[1] - m.a[1]
      const sp = frame.pixelSpacing
      const label = sp ? `${Math.hypot(dx * sp[1], dy * sp[0]).toFixed(1)} mm` : `${Math.hypot(dx, dy).toFixed(0)} px`
      ctx.font = '500 12px IBM Plex Mono, monospace'
      ctx.shadowColor = '#000'
      ctx.shadowBlur = 3
      ctx.fillText(label, b[0] + 6, b[1] - 6)
      ctx.restore()
    }
  }, [processed, matrix, size, overlays, showOverlays, measurements, draft, frame, imgW, imgH, baseScale, view.zoom])

  // ---------------------------------------------------------------- interaction
  const drag = useRef<{ x: number; y: number; view: ViewState; button: number } | null>(null)

  const toImage = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const rect = canvasRef.current!.getBoundingClientRect()
      const p = matrix.inverse().transformPoint(new DOMPoint(clientX - rect.left, clientY - rect.top))
      return [p.x, p.y]
    },
    [matrix],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    if (!frame) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const effective: Tool = e.button === 2 ? 'wl' : e.button === 1 || e.shiftKey ? 'pan' : tool
    if (effective === 'length' && e.button === 0) {
      const p = toImage(e.clientX, e.clientY)
      setDraft({ id: crypto.randomUUID(), frameId: frame.id, a: p, b: p })
      return
    }
    if (effective === 'pan' && e.button === 0 && onSelectOverlay && showOverlays) {
      const [ix, iy] = toImage(e.clientX, e.clientY)
      const hit = overlays.find((o) => {
        const [x, y, w, h] = o.bbox
        return ix >= x * imgW && ix <= (x + w) * imgW && iy >= y * imgH && iy <= (y + h) * imgH
      })
      if (hit) onSelectOverlay(hit.id)
    }
    drag.current = { x: e.clientX, y: e.clientY, view, button: effective === 'wl' ? 2 : effective === 'zoom' ? 3 : 0 }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (draft) {
      setDraft({ ...draft, b: toImage(e.clientX, e.clientY) })
      return
    }
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (d.button === 2) {
      const range = frame?.raw ? Math.max(200, d.view.ww) : 256
      setView({ ...d.view, wc: d.view.wc + (dy * range) / 400, ww: Math.max(1, d.view.ww + (dx * range) / 200) })
    } else if (d.button === 3) {
      setView({ ...d.view, zoom: clamp(d.view.zoom * Math.exp(-dy / 150), 0.2, 20) })
    } else {
      setView({ ...d.view, panX: d.view.panX + dx, panY: d.view.panY + dy })
    }
  }

  const onPointerUp = () => {
    if (draft) {
      const len = Math.hypot(draft.b[0] - draft.a[0], draft.b[1] - draft.a[1])
      if (len > 2) setMeasurements((m) => [...m, draft])
      setDraft(null)
    }
    drag.current = null
  }

  const onWheel = (e: React.WheelEvent) => {
    if (!frame) return
    if (series && series.frames.length > 1 && e.altKey) {
      onFrameIndex(clamp(frameIndex + Math.sign(e.deltaY), 0, series.frames.length - 1))
      return
    }
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left - size.w / 2
    const my = e.clientY - rect.top - size.h / 2
    const factor = Math.exp(-e.deltaY / 500)
    setView((v) => {
      const zoom = clamp(v.zoom * factor, 0.2, 20)
      const k = zoom / v.zoom
      return { ...v, zoom, panX: mx - (mx - v.panX) * k, panY: my - (my - v.panY) * k }
    })
  }

  const reset = useCallback(() => {
    const [wc, ww] = defaultWindow(frame)
    setView({ zoom: 1, panX: 0, panY: 0, rotation: 0, flipH: false, flipV: false, invert: false, wc, ww })
    setMeasurements([])
  }, [frame])

  // Keyboard shortcuts.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'r' || e.key === 'R') reset()
      else if (e.key === 'i' || e.key === 'I') setView((v) => ({ ...v, invert: !v.invert }))
      else if (e.key === 'm' || e.key === 'M') setTool('length')
      else if (e.key === 'p' || e.key === 'P') setTool('pan')
      else if (e.key === 'w' || e.key === 'W') setTool('wl')
      else if (e.key === 'z' || e.key === 'Z') setTool('zoom')
      else if (e.key === 'o' || e.key === 'O') setShowOverlays((s) => !s)
      else if (series && series.frames.length > 1 && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) onFrameIndex(Math.min(series.frames.length - 1, frameIndex + 1))
      else if (series && series.frames.length > 1 && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) onFrameIndex(Math.max(0, frameIndex - 1))
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [reset, series, frameIndex, onFrameIndex])

  const toolBtn = (t: Tool, label: string, icon: React.ReactNode, key: string) => (
    <button className="tool" aria-pressed={tool === t} onClick={() => setTool(t)} title={`${label} (${key})`} aria-label={label}>
      {icon}
    </button>
  )

  const multi = (series?.frames.length ?? 0) > 1
  const wlLabel = frame?.raw ? `J: ${Math.round(view.ww)}  N: ${Math.round(view.wc)}` : `J: ${Math.round(view.ww)}  N: ${Math.round(view.wc)} (8-bit)`
  const tr = series
    ? [
        `${MODALITY_LABEL[series.modality]} · ${REGION_LABEL[series.region]}`,
        series.description,
        multi ? `Img ${frameIndex + 1}/${series.frames.length}${frame?.timeSec !== undefined ? `  t=${formatTime(frame.timeSec)}` : ''}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : ''

  return (
    <>
      <div className="viewer-toolbar no-print" role="toolbar" aria-label="Ferramentas do visualizador">
        {toolBtn('pan', 'Mover / selecionar', <Move size={17} />, 'P')}
        {toolBtn('zoom', 'Zoom', <ZoomIn size={17} />, 'Z')}
        {toolBtn('wl', 'Janela/Nível', <SunMoon size={17} />, 'W')}
        {toolBtn('length', 'Medir distância', <Ruler size={17} />, 'M')}
        <span className="tool-sep" />
        <button className="tool" aria-pressed={view.invert} onClick={() => setView((v) => ({ ...v, invert: !v.invert }))} title="Inverter (I)" aria-label="Inverter">
          <Contrast size={17} />
        </button>
        <button className="tool" onClick={() => setView((v) => ({ ...v, rotation: ((v.rotation + 270) % 360) as ViewState['rotation'] }))} title="Rodar à esquerda" aria-label="Rodar à esquerda">
          <RotateCcw size={17} />
        </button>
        <button className="tool" onClick={() => setView((v) => ({ ...v, rotation: ((v.rotation + 90) % 360) as ViewState['rotation'] }))} title="Rodar à direita" aria-label="Rodar à direita">
          <RotateCw size={17} />
        </button>
        <button className="tool" aria-pressed={view.flipH} onClick={() => setView((v) => ({ ...v, flipH: !v.flipH }))} title="Espelhar horizontal" aria-label="Espelhar horizontal">
          <FlipHorizontal2 size={17} />
        </button>
        <button className="tool" aria-pressed={view.flipV} onClick={() => setView((v) => ({ ...v, flipV: !v.flipV }))} title="Espelhar vertical" aria-label="Espelhar vertical">
          <FlipVertical2 size={17} />
        </button>
        <button className="tool" onClick={reset} title="Repor vista (R)" aria-label="Repor vista">
          <Maximize size={17} />
        </button>
        <span className="tool-sep" />
        <button className="tool" aria-pressed={showOverlays} onClick={() => setShowOverlays((s) => !s)} title="Mostrar/ocultar marcações da IA (O)" aria-label="Marcações da IA">
          {showOverlays ? <Eye size={17} /> : <EyeOff size={17} />}
        </button>
        {series?.videoUrl && (
          <button className="tool" aria-pressed={showClip} onClick={() => setShowClip((s) => !s)} title="Ver clip original" aria-label="Ver clip original">
            <Video size={17} />
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-xs)', color: 'var(--text-3)', whiteSpace: 'nowrap', paddingRight: 6 }}>
          Roda: zoom · Botão direito: J/N · Shift: mover
        </span>
      </div>

      <div
        className="viewport"
        ref={hostRef}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: tool === 'length' ? 'crosshair' : tool === 'pan' ? 'grab' : tool === 'wl' ? 'ns-resize' : 'zoom-in' }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          aria-label="Imagem médica"
          role="img"
        />
        {showClip && series?.videoUrl && (
          <video
            src={series.videoUrl}
            controls
            autoPlay
            loop
            muted
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#000', objectFit: 'contain' }}
          />
        )}
        {!series && <div className="viewer-empty">Sem imagens neste caso</div>}
        {series && !showClip && (
          <>
            <div className="corner tl">{cornerTopLeft}</div>
            <div className="corner tr">{tr}</div>
            <div className="corner bl">{`${wlLabel}\nZoom: ${Math.round(baseScale * view.zoom * 100)}%${view.rotation ? `  Rot: ${view.rotation}°` : ''}`}</div>
            <div className="corner br">{cornerBottomRight}</div>
          </>
        )}
      </div>

      {multi && series && (
        <div className="no-print">
          <div className="cine">
            <button className="btn btn-sm btn-ghost" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pausa' : 'Reproduzir'}>
              {playing ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <input
              type="range"
              min={0}
              max={series.frames.length - 1}
              value={frameIndex}
              onChange={(e) => onFrameIndex(Number(e.target.value))}
              aria-label="Fotograma"
            />
            <span className="mono">
              {frameIndex + 1}/{series.frames.length}
            </span>
          </div>
          <div className="frame-strip" role="listbox" aria-label="Fotogramas-chave">
            {series.frames.map((f, i) => (
              <button key={f.id} aria-pressed={i === frameIndex} onClick={() => onFrameIndex(i)} title={f.timeSec !== undefined ? `t = ${formatTime(f.timeSec)}` : `Imagem ${i + 1}`}>
                <img src={f.url} alt="" />
                {f.timeSec !== undefined && <span className="ts">{formatTime(f.timeSec)}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
