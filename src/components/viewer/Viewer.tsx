import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react'
import type { Case, Frame, Series } from '../../types'
import { renderWindowed } from '../../lib/imaging/dicom'
import { loadHtmlImage } from '../../lib/imaging/image'
import { clamp, formatDate } from '../../lib/util'
import { MODALITY_LABEL, REGION_LABEL } from '../../lib/labels'
import { LATERALITY_SHORT, MODALITY_DICOM, MODALITY_SHORT, ageBand } from '../../lib/labels-findings'
import { ViewerToolbar, type Tool, type WlPreset } from './ViewerToolbar'
import { FindingsOverlay, type OverlayItem, type Rect } from './FindingsOverlay'
import { CineBar, type CineSpan } from './CineBar'
import { ShortcutsDialog } from './ShortcutsDialog'
import { fmtClock, fmtNum } from './format'
import { isDrawable, orderedRange, playableLoop, seriesDuration, studyClass } from './findingModel'
import { isTriageOnly } from '../../lib/report/state'

type P2 = [number, number]

interface ViewState {
  /** Zoom relative to «fit to screen». */
  zoom: number
  /** Image point (in pixels) shown at the centre of the viewport — survives viewport resizes. */
  cx: number
  cy: number
  rotation: 0 | 90 | 180 | 270
  flipH: boolean
  flipV: boolean
  invert: boolean
  wc: number
  ww: number
}

type Measurement = { id: string; frameId: string } & ({ kind: 'length'; pts: [P2, P2] } | { kind: 'angle'; pts: [P2, P2, P2] })

interface Draft {
  kind: 'length' | 'angle'
  pts: P2[]
  /** Angle only: 1 = drawing the first arm, 2 = placing the third point. */
  phase: 1 | 2
}

type Gesture =
  | { kind: 'drag'; mode: 'pan' | 'zoom' | 'wl'; x0: number; y0: number; v0: ViewState; moved: boolean; button: number }
  | { kind: 'pinch'; d0: number; v0: ViewState; anchor: DOMPoint }
  | { kind: 'measure' }

export interface FocusRequest {
  id: string
  nonce: number
  zoom: boolean
}

export interface ViewerProps {
  c: Case
  series: Series | undefined
  seriesNumber: number
  frameIndex: number
  onFrameIndex: (i: number) => void
  onSeriesStep: (dir: 1 | -1) => void
  codes: Map<string, string>
  aiVisible: boolean
  onToggleAi: () => void
  /** Shown even while AI overlays are hidden (the clinician clicked its row). */
  revealedId?: string
  selectedId?: string
  hoveredId?: string
  onHover: (id: string | undefined) => void
  onSelectFinding: (id: string) => void
  onNavigate: (dir: 1 | -1) => void
  navIndex: number
  navTotal: number
  focus?: FocusRequest
  onFindingKey: (kind: 'accept' | 'reject' | 'edit') => void
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 40
const FIT_PAD = 8
const MEASURE_COLOR = '#40e0ff'
const OV_POSITIVE = '#ff4d4f'
const OV_DOUBTFUL = '#ffc53d'
const CT_PRESETS: { label: string; wc: number; ww: number }[] = [
  { label: 'Osso', ww: 2500, wc: 480 },
  { label: 'Tecido mole', ww: 400, wc: 40 },
  { label: 'Osso fino', ww: 2000, wc: 300 },
  { label: 'Metal/prótese', ww: 4000, wc: 700 },
]

function frameDims(f: Frame | undefined): P2 {
  if (!f) return [1, 1]
  if (f.raw) return [f.raw.columns, f.raw.rows]
  return [Math.max(1, f.width), Math.max(1, f.height)]
}

function defaultView(f: Frame | undefined): ViewState {
  const [w, h] = frameDims(f)
  return {
    zoom: 1,
    cx: w / 2,
    cy: h / 2,
    rotation: 0,
    flipH: false,
    flipV: false,
    invert: false,
    wc: f?.raw ? f.raw.windowCenter : 127.5,
    ww: f?.raw ? f.raw.windowWidth : 256,
  }
}

function fitScale(size: { w: number; h: number }, iw: number, ih: number, rotated: boolean): number {
  if (!size.w || !size.h) return 1
  const w = rotated ? ih : iw
  const h = rotated ? iw : ih
  return Math.max(1e-4, Math.min((size.w - FIT_PAD * 2) / w, (size.h - FIT_PAD * 2) / h))
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

function percentileWindow(count: number, get: (i: number) => number): [number, number] {
  const sample: number[] = []
  const step = Math.max(1, Math.floor(count / 60000))
  for (let i = 0; i < count; i += step) sample.push(get(i))
  if (!sample.length) return [127.5, 256]
  sample.sort((a, b) => a - b)
  const lo = sample[Math.floor(sample.length * 0.01)]
  const hi = sample[Math.floor(sample.length * 0.99)]
  return [(lo + hi) / 2, Math.max(1, hi - lo)]
}

export function Viewer(props: ViewerProps) {
  const { c, series, seriesNumber, frameIndex, onFrameIndex, codes, aiVisible, revealedId, selectedId, hoveredId, focus } = props
  const findings = useMemo(() => c.analysis?.findings ?? [], [c.analysis?.findings])
  const frame = series?.frames[frameIndex]
  const n = series?.frames.length ?? 0
  const multi = n > 1

  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<ViewState>(() => defaultView(frame))
  const [tool, setTool] = useState<Tool>('pan')
  const [hist, setHist] = useState<{ items: Measurement[]; redo: Measurement[] }>({ items: [], redo: [] })
  const measurements = hist.items
  const [draft, setDraftState] = useState<Draft | null>(null)
  const draftRef = useRef<Draft | null>(null)
  const setDraft = (d: Draft | null) => {
    draftRef.current = d
    setDraftState(d)
  }
  const [showText, setShowText] = useState(true)
  const [opacity, setOpacity] = useState(0.75)
  const [showClip, setShowClip] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [repeat, setRepeat] = useState(true)
  const [loopRange, setLoopRange] = useState<[number, number] | undefined>()
  const [pulse, setPulse] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [hoverBox, setHoverBox] = useState(false)

  // ------------------------------------------------------------ image source
  const imgCache = useRef(new Map<string, HTMLImageElement>())
  const [loaded, setLoaded] = useState<{ frameId: string; img: HTMLImageElement } | null>(null)
  const srcData = useRef<{ frameId: string; data: ImageData } | null>(null)
  const procCanvas = useRef<HTMLCanvasElement | null>(null)
  const lastDrawn = useRef<{ src: CanvasImageSource; w: number; h: number } | null>(null)

  const [imgW, imgH] = frameDims(frame)

  // Reset the view when the series changes (keeps measurements: they are tied to frames).
  useEffect(() => {
    setView(defaultView(series?.frames[0]))
    setPlaying(false)
    setShowClip(false)
    setLoopRange(undefined)
    setDraft(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series?.id])

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const cacheImage = (id: string, img: HTMLImageElement) => {
    const cache = imgCache.current
    cache.set(id, img)
    if (cache.size > 64) cache.delete(cache.keys().next().value as string)
  }

  useEffect(() => {
    if (!frame || frame.raw) return
    const hit = imgCache.current.get(frame.id)
    if (hit) {
      setLoaded({ frameId: frame.id, img: hit })
      return
    }
    let cancelled = false
    loadHtmlImage(frame.url)
      .then((img) => {
        cacheImage(frame.id, img)
        if (!cancelled) setLoaded({ frameId: frame.id, img })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [frame])

  // Prefetch the frames of short clips so cine playback does not flicker.
  useEffect(() => {
    if (!series || series.frames.length < 2 || series.frames.length > 64 || series.frames[0]?.raw) return
    let cancelled = false
    ;(async () => {
      for (const f of series.frames) {
        if (cancelled) return
        if (imgCache.current.has(f.id)) continue
        try {
          cacheImage(f.id, await loadHtmlImage(f.url))
        } catch {
          /* a broken frame only affects itself */
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [series])

  const processed = useMemo((): { src: CanvasImageSource; w: number; h: number } | null => {
    if (!frame) return null
    const raw = frame.raw
    if (raw) {
      const cv = procCanvas.current ?? document.createElement('canvas')
      procCanvas.current = cv
      cv.width = raw.columns
      cv.height = raw.rows
      const ctx = cv.getContext('2d')!
      const out = ctx.createImageData(raw.columns, raw.rows)
      renderWindowed(raw, view.wc, view.ww, raw.invert !== view.invert, out.data)
      ctx.putImageData(out, 0, 0)
      return { src: cv, w: raw.columns, h: raw.rows }
    }
    if (!loaded || loaded.frameId !== frame.id) return null
    const img = loaded.img
    const w = img.naturalWidth
    const h = img.naturalHeight
    const identity = !view.invert && Math.abs(view.wc - 127.5) < 0.01 && Math.abs(view.ww - 256) < 0.01
    if (identity) return { src: img, w, h }
    let data = srcData.current?.frameId === frame.id ? srcData.current.data : null
    if (!data) {
      const tmp = document.createElement('canvas')
      tmp.width = w
      tmp.height = h
      const tctx = tmp.getContext('2d', { willReadFrequently: true })!
      tctx.drawImage(img, 0, 0)
      data = tctx.getImageData(0, 0, w, h)
      srcData.current = { frameId: frame.id, data }
    }
    const cv = procCanvas.current ?? document.createElement('canvas')
    procCanvas.current = cv
    cv.width = w
    cv.height = h
    const ctx = cv.getContext('2d')!
    const out = ctx.createImageData(w, h)
    const lo = view.wc - view.ww / 2
    const lut = new Uint8ClampedArray(256)
    for (let i = 0; i < 256; i++) {
      const g = clamp(((i - lo) / view.ww) * 255, 0, 255)
      lut[i] = view.invert ? 255 - g : g
    }
    const d = data.data
    for (let i = 0; i < d.length; i += 4) {
      out.data[i] = lut[d[i]]
      out.data[i + 1] = lut[d[i + 1]]
      out.data[i + 2] = lut[d[i + 2]]
      out.data[i + 3] = 255
    }
    ctx.putImageData(out, 0, 0)
    return { src: cv, w, h }
  }, [frame, loaded, view.wc, view.ww, view.invert])

  // ------------------------------------------------------------ geometry
  const geomFor = useCallback(
    (v: ViewState) => {
      const fit = fitScale(size, imgW, imgH, v.rotation % 180 !== 0)
      const s = fit * v.zoom
      // Flips act on the screen axes (applied after the rotation), so «Espelhar horizontal» always mirrors left↔right.
      const lin = new DOMMatrix().scale(v.flipH ? -1 : 1, v.flipV ? -1 : 1).rotate(v.rotation).scale(s)
      const M = new DOMMatrix().translate(size.w / 2, size.h / 2).multiply(lin).translate(-v.cx, -v.cy)
      return { fit, s, lin, M }
    },
    [size, imgW, imgH],
  )
  const geom = useMemo(() => geomFor(view), [geomFor, view])
  const toScreen = useCallback((p: P2): P2 => {
    const q = geom.M.transformPoint(new DOMPoint(p[0], p[1]))
    return [q.x, q.y]
  }, [geom])
  const toImage = useCallback((x: number, y: number): P2 => {
    const q = geom.M.inverse().transformPoint(new DOMPoint(x, y))
    return [q.x, q.y]
  }, [geom])

  const zoomAt = useCallback(
    (v: ViewState, factor: number, sx: number, sy: number): ViewState => {
      const zoom = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM)
      const anchor = geomFor(v).M.inverse().transformPoint(new DOMPoint(sx, sy))
      const off = geomFor({ ...v, zoom }).lin.inverse().transformPoint(new DOMPoint(sx - size.w / 2, sy - size.h / 2))
      return { ...v, zoom, cx: anchor.x - off.x, cy: anchor.y - off.y }
    },
    [geomFor, size],
  )

  // ------------------------------------------------------------ AI overlays
  const overlayItems: OverlayItem[] = useMemo(() => {
    if (!series || !frame || showClip) return []
    const out: OverlayItem[] = []
    for (const f of findings) {
      if (!isDrawable(f)) continue
      if (!(f.origin === 'clinician' || aiVisible || f.id === revealedId)) continue
      f.locations.forEach((loc, li) => {
        if (loc.seriesId !== series.id || loc.frameIndex !== frameIndex || !loc.bbox) return
        const [x, y, w, h] = loc.bbox
        const pts = [
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
        ].map(([u, v]) => geom.M.transformPoint(new DOMPoint(u * imgW, v * imgH)))
        const pad = f.origin === 'ai' ? 8 : 0
        const minX = Math.min(...pts.map((p) => p.x)) - pad
        const maxX = Math.max(...pts.map((p) => p.x)) + pad
        const minY = Math.min(...pts.map((p) => p.y)) - pad
        const maxY = Math.max(...pts.map((p) => p.y)) + pad
        out.push({ key: `${f.id}-${li}`, finding: f, code: codes.get(f.id) ?? '', rect: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } })
      })
    }
    return out
  }, [series, frame, showClip, findings, aiVisible, revealedId, frameIndex, geom, imgW, imgH, codes])

  const hitTest = (x: number, y: number): string | undefined => {
    const inside = (r: Rect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
    return overlayItems
      .filter((o) => inside(o.rect))
      .sort((a, b) => a.rect.w * a.rect.h - b.rect.w * b.rect.h)[0]?.finding.id
  }

  // ------------------------------------------------------------ focus a finding (row click / N)
  const appliedFocus = useRef(0)
  useEffect(() => {
    if (!focus || focus.nonce === appliedFocus.current || !series || !size.w || !size.h) return
    const f = findings.find((x) => x.id === focus.id)
    if (!f) return
    appliedFocus.current = focus.nonce
    setPulse((p) => p + 1)
    const onThisSeries = f.locations.some((l) => l.seriesId === series.id)
    setLoopRange(f.frameRange && series.frames.length > 1 && onThisSeries ? orderedRange(f.frameRange) : undefined)
    if (!focus.zoom) return
    const loc =
      f.locations.find((l) => l.seriesId === series.id && l.bbox && l.frameIndex === frameIndex) ?? f.locations.find((l) => l.seriesId === series.id && l.bbox)
    if (!loc?.bbox) return
    const [iw, ih] = frameDims(series.frames[loc.frameIndex] ?? frame)
    const [x, y, w, h] = loc.bbox
    const bw = Math.max(w * iw, 4) + 16
    const bh = Math.max(h * ih, 4) + 16
    setView((v) => {
      const rotated = v.rotation % 180 !== 0
      const fit = fitScale(size, iw, ih, rotated)
      const sw = (rotated ? bh : bw) * fit
      const sh = (rotated ? bw : bh) * fit
      const zoom = clamp(Math.min((0.6 * size.w) / sw, (0.6 * size.h) / sh), 1, 8)
      return { ...v, zoom, cx: (x + w / 2) * iw, cy: (y + h / 2) * ih }
    })
  }, [focus, size, series, frameIndex, findings, frame])

  // ------------------------------------------------------------ draw
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.w || !size.h) return
    const dpr = window.devicePixelRatio || 1
    const W = Math.round(size.w * dpr)
    const H = Math.round(size.h * dpr)
    if (canvas.width !== W) canvas.width = W
    if (canvas.height !== H) canvas.height = H
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, size.w, size.h)
    if (!frame) return
    let img = processed
    if (!img && lastDrawn.current && lastDrawn.current.w === imgW && lastDrawn.current.h === imgH) img = lastDrawn.current
    if (img) {
      lastDrawn.current = img
      ctx.save()
      ctx.setTransform(new DOMMatrix([dpr, 0, 0, dpr, 0, 0]).multiply(geom.M))
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img.src, 0, 0, img.w, img.h, 0, 0, imgW, imgH)
      ctx.restore()
    }

    const sp = frame.pixelSpacing
    const all: { kind: 'length' | 'angle'; pts: P2[]; draft?: boolean }[] = [
      ...measurements.filter((m) => m.frameId === frame.id),
      ...(draft ? [{ ...draft, draft: true }] : []),
    ]
    for (const m of all) {
      const s = m.pts.map(toScreen)
      ctx.save()
      ctx.strokeStyle = MEASURE_COLOR
      ctx.fillStyle = MEASURE_COLOR
      ctx.lineWidth = 1.5
      ctx.shadowColor = 'rgba(0,0,0,0.9)'
      ctx.shadowBlur = 2
      ctx.beginPath()
      if (m.kind === 'length' || s.length === 2) {
        ctx.moveTo(s[0][0], s[0][1])
        ctx.lineTo(s[1][0], s[1][1])
      } else {
        ctx.moveTo(s[0][0], s[0][1])
        ctx.lineTo(s[1][0], s[1][1])
        ctx.lineTo(s[2][0], s[2][1])
      }
      ctx.stroke()
      for (const p of s) {
        ctx.beginPath()
        ctx.arc(p[0], p[1], 3, 0, Math.PI * 2)
        ctx.fill()
      }
      let label = ''
      let anchor = s[s.length - 1]
      const scaleVec = (a: P2, b: P2): P2 => (sp ? [(b[0] - a[0]) * sp[1], (b[1] - a[1]) * sp[0]] : [b[0] - a[0], b[1] - a[1]])
      if (m.kind === 'length') {
        const [dx, dy] = scaleVec(m.pts[0], m.pts[1])
        const len = Math.hypot(dx, dy)
        // ImagerPixelSpacing without a magnification factor is measured at the detector, not the patient.
        label = sp ? `${fmtNum(len, 1)} mm${frame.pixelSpacingSource === 'detector' ? ' (detetor)' : ''}` : `${fmtNum(len, 0)} px`
      } else if (m.pts.length === 3 && !(m.draft && draft?.phase === 1)) {
        const v1 = scaleVec(m.pts[1], m.pts[0])
        const v2 = scaleVec(m.pts[1], m.pts[2])
        const n1 = Math.hypot(...v1)
        const n2 = Math.hypot(...v2)
        if (n1 > 0 && n2 > 0) {
          const deg = (Math.acos(clamp((v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2), -1, 1)) * 180) / Math.PI
          label = `${fmtNum(deg, 1)}°`
          anchor = s[1]
          const a1 = Math.atan2(s[0][1] - s[1][1], s[0][0] - s[1][0])
          const a2 = Math.atan2(s[2][1] - s[1][1], s[2][0] - s[1][0])
          let delta = a2 - a1
          while (delta > Math.PI) delta -= Math.PI * 2
          while (delta < -Math.PI) delta += Math.PI * 2
          ctx.beginPath()
          ctx.arc(s[1][0], s[1][1], 18, a1, a1 + delta, delta < 0)
          ctx.stroke()
        }
      }
      if (label) {
        ctx.font = '600 12px "Geist Variable", system-ui, sans-serif'
        ctx.shadowBlur = 0
        const tw = ctx.measureText(label).width
        const lx = clamp(anchor[0] + 8, 2, size.w - tw - 10)
        const ly = clamp(anchor[1] - 22, 2, size.h - 20)
        ctx.fillStyle = 'rgba(12,12,12,0.85)'
        ctx.fillRect(lx, ly, tw + 8, 18)
        ctx.fillStyle = MEASURE_COLOR
        ctx.fillText(label, lx + 4, ly + 13)
      }
      ctx.restore()
    }
  }, [processed, geom, size, measurements, draft, frame, imgW, imgH, toScreen])

  // ------------------------------------------------------------ cine
  // A single-frame finding range cannot loop: play the whole clip instead of freezing on one frame.
  const loop = playableLoop(loopRange, n)
  const loopLabel = loop && selectedId ? codes.get(selectedId) : undefined

  useEffect(() => {
    if (!playing || !series || series.frames.length < 2) return
    const last = series.frames.length - 1
    const [lo, hi] = loop ?? [0, last]
    let next = frameIndex + 1
    let delay: number
    if (frameIndex < lo || frameIndex >= hi) {
      if (frameIndex >= hi && !repeat && !loop) {
        setPlaying(false)
        return
      }
      next = lo
      delay = 350
    } else {
      const t0 = series.frames[frameIndex]?.timeSec
      const t1 = series.frames[next]?.timeSec
      delay = t0 !== undefined && t1 !== undefined && t1 > t0 ? (t1 - t0) * 1000 : 100
    }
    const id = window.setTimeout(() => onFrameIndex(next), clamp(delay / speed, 30, 4000))
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, frameIndex, series, speed, repeat, loop?.[0], loop?.[1], onFrameIndex])

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed
  }, [speed, showClip])

  const togglePlay = () => {
    if (!series || n < 2) return
    if (!playing) {
      const hi = loop ? loop[1] : n - 1
      if (frameIndex >= hi && !repeat && !loop) onFrameIndex(0)
    }
    setPlaying((p) => !p)
  }

  const cineSpans: CineSpan[] = useMemo(() => {
    if (!series || n < 2) return []
    return findings
      .filter((f) => f.frameRange && isDrawable(f) && f.locations.some((l) => l.seriesId === series.id))
      .filter((f) => f.origin === 'clinician' || aiVisible || f.id === revealedId)
      .map((f) => ({ id: f.id, code: codes.get(f.id) ?? '', label: f.label, cls: f.cls, range: orderedRange(f.frameRange!) }))
  }, [findings, series, n, aiVisible, revealedId, codes])

  // ------------------------------------------------------------ view actions
  const fit = () => setView((v) => ({ ...v, zoom: 1, cx: imgW / 2, cy: imgH / 2 }))
  const resetView = () => setView(defaultView(frame))
  // With a single flip the picture is mirrored, so the image-space rotation runs the other way to keep «R» clockwise on screen.
  const rotate = (dir: 1 | -1) =>
    setView((v) => {
      const d = v.flipH !== v.flipV ? -dir : dir
      return { ...v, rotation: ((v.rotation + (d === 1 ? 90 : 270)) % 360) as ViewState['rotation'] }
    })
  const zoomBy = (factor: number) => setView((v) => zoomAt(v, factor, size.w / 2, size.h / 2))

  const presets: (WlPreset & { apply: () => void })[] = useMemo(() => {
    if (!frame || series?.kind === 'video') return []
    const list: (WlPreset & { apply: () => void })[] = []
    if (frame.raw && series?.modality === 'CT') {
      for (const p of CT_PRESETS) list.push({ key: p.label, label: p.label, detail: `${p.ww}/${p.wc}`, apply: () => setView((v) => ({ ...v, wc: p.wc, ww: p.ww })) })
    }
    list.push({
      key: 'auto',
      label: 'Automático',
      detail: 'percentis 1–99',
      apply: () => {
        if (frame.raw) {
          const r = frame.raw
          const [wc, ww] = percentileWindow(r.data.length, (i) => r.data[i] * r.slope + r.intercept)
          setView((v) => ({ ...v, wc, ww }))
        } else if (loaded?.frameId === frame.id) {
          const img = loaded.img
          const tmp = document.createElement('canvas')
          tmp.width = img.naturalWidth
          tmp.height = img.naturalHeight
          const tctx = tmp.getContext('2d', { willReadFrequently: true })!
          tctx.drawImage(img, 0, 0)
          const d = tctx.getImageData(0, 0, tmp.width, tmp.height).data
          const [wc, ww] = percentileWindow(d.length / 4, (i) => (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0)
          setView((v) => ({ ...v, wc, ww }))
        }
      },
    })
    list.push({
      key: 'reset',
      label: 'Repor contraste',
      apply: () => {
        const d = defaultView(frame)
        setView((v) => ({ ...v, wc: d.wc, ww: d.ww }))
      },
    })
    return list.slice(0, 5)
  }, [frame, series?.kind, series?.modality, loaded])

  const undo = () => setHist((h) => (h.items.length ? { items: h.items.slice(0, -1), redo: [...h.redo, h.items[h.items.length - 1]] } : h))
  const redo = () => setHist((h) => (h.redo.length ? { items: [...h.items, h.redo[h.redo.length - 1]], redo: h.redo.slice(0, -1) } : h))
  const commit = (m: Measurement) => setHist((h) => ({ items: [...h.items, m], redo: [] }))

  const capture = () => {
    const cv = canvasRef.current
    if (!cv || !size.w) return
    const out = document.createElement('canvas')
    out.width = cv.width
    out.height = cv.height
    const ctx = out.getContext('2d')!
    ctx.drawImage(cv, 0, 0)
    const dpr = cv.width / size.w
    ctx.scale(dpr, dpr)
    for (const o of overlayItems) {
      const color = o.finding.cls === 'positive' ? OV_POSITIVE : OV_DOUBTFUL
      ctx.setLineDash(o.finding.cls === 'positive' ? [] : [6, 4])
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(0,0,0,0.65)'
      ctx.strokeRect(o.rect.x, o.rect.y, o.rect.w, o.rect.h)
      ctx.lineWidth = 2
      ctx.strokeStyle = color
      ctx.strokeRect(o.rect.x, o.rect.y, o.rect.w, o.rect.h)
      ctx.setLineDash([])
      ctx.font = '600 11px "Geist Variable", system-ui, sans-serif'
      const label = `IA ${o.code} ≈ ${o.finding.label}`
      const tw = ctx.measureText(label).width
      const ly = o.rect.y > 20 ? o.rect.y - 18 : o.rect.y + 2
      ctx.fillStyle = 'rgba(12,12,12,0.85)'
      ctx.fillRect(o.rect.x, ly, tw + 8, 16)
      ctx.fillStyle = '#f5f5f5'
      ctx.fillText(label, o.rect.x + 4, ly + 12)
    }
    out.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${c.pseudoId}-serie${seriesNumber}-img${frameIndex + 1}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    }, 'image/png')
  }

  // ------------------------------------------------------------ pointer interaction
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<Gesture | null>(null)
  const local = (e: { clientX: number; clientY: number }): P2 => {
    const r = hostRef.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!frame || showClip) return
    if ((e.target as HTMLElement).closest('button, a, input, select')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const [x, y] = local(e)
    pointers.current.set(e.pointerId, { x, y })
    if (pointers.current.size === 2) {
      const d = draftRef.current
      if (d && (d.kind === 'length' || d.phase === 1)) setDraft(null)
      const [a, b] = [...pointers.current.values()]
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      gesture.current = { kind: 'pinch', d0: Math.max(12, dist(a, b)), v0: view, anchor: geom.M.inverse().transformPoint(new DOMPoint(mid.x, mid.y)) }
      setDragging(true)
      return
    }
    if (pointers.current.size > 2) return
    const isMouse = e.pointerType === 'mouse'
    const mode: Tool = isMouse && e.button === 2 ? 'wl' : isMouse && (e.button === 1 || e.shiftKey) ? 'pan' : tool
    if ((mode === 'length' || mode === 'angle') && e.button === 0) {
      const ip = toImage(x, y)
      const d = draftRef.current
      if (mode === 'angle' && d?.kind === 'angle' && d.phase === 2) setDraft({ ...d, pts: [d.pts[0], d.pts[1], ip] })
      else setDraft({ kind: mode, pts: [ip, ip], phase: 1 })
      gesture.current = { kind: 'measure' }
      return
    }
    gesture.current = { kind: 'drag', mode: mode === 'zoom' ? 'zoom' : mode === 'wl' ? 'wl' : 'pan', x0: x, y0: y, v0: view, moved: false, button: e.button }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!frame) return
    const [x, y] = local(e)
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x, y })
    const g = gesture.current
    if (!g) {
      if (e.pointerType !== 'mouse') return
      const d = draftRef.current
      if (d?.kind === 'angle' && d.phase === 2) setDraft({ ...d, pts: [d.pts[0], d.pts[1], toImage(x, y)] })
      const hit = hitTest(x, y)
      setHoverBox(!!hit)
      if (hit !== hoveredId) props.onHover(hit)
      return
    }
    if (g.kind === 'pinch') {
      if (pointers.current.size < 2) return
      const [a, b] = [...pointers.current.values()]
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const zoom = clamp((g.v0.zoom * dist(a, b)) / g.d0, MIN_ZOOM, MAX_ZOOM)
      const v1 = { ...g.v0, zoom }
      const off = geomFor(v1).lin.inverse().transformPoint(new DOMPoint(mid.x - size.w / 2, mid.y - size.h / 2))
      setView({ ...v1, cx: g.anchor.x - off.x, cy: g.anchor.y - off.y })
      return
    }
    if (g.kind === 'measure') {
      const d = draftRef.current
      if (!d) return
      const ip = toImage(x, y)
      if (d.kind === 'length' || d.phase === 1) setDraft({ ...d, pts: [d.pts[0], ip] })
      else setDraft({ ...d, pts: [d.pts[0], d.pts[1], ip] })
      return
    }
    const dx = x - g.x0
    const dy = y - g.y0
    if (!g.moved) {
      if (Math.hypot(dx, dy) < 4) return
      g.moved = true
      setDragging(true)
    }
    if (g.mode === 'pan') {
      const dd = geomFor(g.v0).lin.inverse().transformPoint(new DOMPoint(dx, dy))
      setView({ ...g.v0, cx: g.v0.cx - dd.x, cy: g.v0.cy - dd.y })
    } else if (g.mode === 'zoom') {
      setView(zoomAt(g.v0, Math.exp(-dy / 150), g.x0, g.y0))
    } else {
      const range = frame.raw ? Math.max(200, g.v0.ww) : 256
      setView({ ...g.v0, wc: g.v0.wc + (dy * range) / 400, ww: Math.max(1, g.v0.ww + (dx * range) / 200) })
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pinch') {
      if (pointers.current.size === 0) setDragging(false)
      gesture.current = null
      return
    }
    gesture.current = null
    setDragging(false)
    if (g.kind === 'measure') {
      const d = draftRef.current
      if (!d || !frame) return
      const s = d.pts.map(toScreen)
      const far = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]) > 4
      if (d.kind === 'length') {
        if (far(s[0], s[1])) commit({ id: crypto.randomUUID(), frameId: frame.id, kind: 'length', pts: [d.pts[0], d.pts[1]] })
        setDraft(null)
      } else if (d.phase === 1) {
        if (far(s[0], s[1])) setDraft({ kind: 'angle', pts: [d.pts[0], d.pts[1], d.pts[1]], phase: 2 })
        else setDraft(null)
      } else if (s.length === 3 && far(s[1], s[2])) {
        commit({ id: crypto.randomUUID(), frameId: frame.id, kind: 'angle', pts: [d.pts[0], d.pts[1], d.pts[2]] })
        setDraft(null)
      }
      return
    }
    if (!g.moved && g.button === 0) {
      const [x, y] = local(e)
      const hit = hitTest(x, y)
      if (hit) props.onSelectFinding(hit)
    }
  }

  // Wheel: plain wheel scrolls the stack; Ctrl/⌘ + wheel (and trackpad pinch) zooms.
  const wheelAcc = useRef(0)
  const wheelRef = useRef<(e: WheelEvent) => void>(() => undefined)
  wheelRef.current = (e: WheelEvent) => {
    if (!frame || showClip) return
    e.preventDefault()
    const [x, y] = local(e)
    if (multi && !e.ctrlKey && !e.metaKey) {
      wheelAcc.current += e.deltaY
      if (Math.abs(wheelAcc.current) >= 40) {
        onFrameIndex(clamp(frameIndex + Math.sign(wheelAcc.current), 0, n - 1))
        wheelAcc.current = 0
      }
      return
    }
    const factor = Math.exp(-e.deltaY / (e.ctrlKey ? 120 : 500))
    setView((v) => zoomAt(v, factor, x, y))
  }
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const on = (e: WheelEvent) => wheelRef.current(e)
    el.addEventListener('wheel', on, { passive: false })
    return () => el.removeEventListener('wheel', on)
  }, [])

  // ------------------------------------------------------------ keyboard
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => undefined)
  keyRef.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented || shortcutsOpen || e.altKey || e.metaKey) return
    const t = e.target as HTMLElement | null
    if (t?.closest?.('input, textarea, select, [contenteditable="true"], dialog, [role="dialog"], [role="alertdialog"], [role="menu"]')) return
    // A modal (e.g. «Validar relatório») owns the keyboard, including Escape to close it.
    if (document.querySelector('dialog[open]')) return
    const interactive = !!t?.closest?.('button, a, summary, [role="tab"], [role="slider"]')
    const k = e.key
    if (e.ctrlKey) {
      if (k === 'z' || k === 'Z') (e.shiftKey ? redo : undo)()
      else if (k === 'y' || k === 'Y') redo()
      else return
      e.preventDefault()
      return
    }
    const step = (i: number) => multi && onFrameIndex(clamp(i, 0, n - 1))
    switch (k) {
      case 'p':
      case 'P':
        setTool('pan')
        break
      case 'z':
      case 'Z':
        setTool('zoom')
        break
      case 'w':
      case 'W':
        setTool('wl')
        break
      case 'm':
      case 'M':
        setTool('length')
        break
      case 'g':
      case 'G':
        setTool('angle')
        break
      case '+':
        zoomBy(1.25)
        break
      case '-':
        zoomBy(0.8)
        break
      case '=':
        fit()
        break
      case '0':
        resetView()
        break
      case '1':
      case '2':
      case '3':
      case '4':
      case '5': {
        const p = presets[Number(k) - 1]
        if (!p) return
        p.apply()
        break
      }
      case 'r':
      case 'R':
        rotate(1)
        break
      case 'l':
      case 'L':
        rotate(-1)
        break
      case 'h':
      case 'H':
        setView((v) => ({ ...v, flipH: !v.flipH }))
        break
      case 'v':
      case 'V':
        setView((v) => ({ ...v, flipV: !v.flipV }))
        break
      case 'i':
      case 'I':
        setView((v) => ({ ...v, invert: !v.invert }))
        break
      case 't':
      case 'T':
        setShowText((s) => !s)
        break
      case 'a':
      case 'A':
        props.onToggleAi()
        break
      case 'n':
        props.onNavigate(1)
        break
      case 'N':
        props.onNavigate(-1)
        break
      case '?':
        setShortcutsOpen(true)
        break
      case 'ArrowUp':
      case 'ArrowLeft':
        if (!multi) return
        step(frameIndex - 1)
        break
      case 'ArrowDown':
      case 'ArrowRight':
        if (!multi) return
        step(frameIndex + 1)
        break
      case 'Home':
        if (!multi) return
        step(0)
        break
      case 'End':
        if (!multi) return
        step(n - 1)
        break
      case 'PageUp':
        props.onSeriesStep(-1)
        break
      case 'PageDown':
        props.onSeriesStep(1)
        break
      case ' ':
        if (interactive || !multi) return
        togglePlay()
        break
      case 'Enter':
        if (interactive) return
        props.onFindingKey('accept')
        break
      case 'x':
      case 'X':
        props.onFindingKey('reject')
        break
      case 'e':
      case 'E':
        props.onFindingKey('edit')
        break
      case 'Escape':
        // Only swallow Escape when it actually cancelled a measurement in progress.
        if (draftRef.current) setDraft(null)
        else {
          setTool('pan')
          return
        }
        break
      default:
        return
    }
    e.preventDefault()
  }
  useEffect(() => {
    const on = (e: KeyboardEvent) => keyRef.current(e)
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  useEffect(() => {
    if (tool !== 'angle' && draftRef.current?.kind === 'angle') setDraft(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool])

  // ------------------------------------------------------------ corner text (no PHI: pseudonymous model fields only)
  const hasAnalysis = !!c.analysis
  const frameMeasurements = frame ? measurements.filter((m) => m.frameId === frame.id) : []
  const sp = frame?.pixelSpacing
  const region = series ? `${REGION_LABEL[series.region]}${series.laterality ? ` ${LATERALITY_SHORT[series.laterality]}` : ''}`.trim() : ''
  const sexText = c.sex === 'F' ? 'F' : c.sex === 'M' ? 'M' : '—'
  const isVideo = series?.kind === 'video'
  const t = frame?.timeSec
  const total = series ? seriesDuration(series) : undefined
  const transforms = [
    view.rotation ? `Rot ${view.rotation}°` : '',
    view.flipH ? 'Esp. H' : '',
    view.flipV ? 'Esp. V' : '',
    view.invert ? 'Inv.' : '',
  ].filter(Boolean)
  const measuring = tool === 'length' || tool === 'angle' || frameMeasurements.length > 0
  const corners = series
    ? {
        tl: [c.pseudoId, `${sexText} · ${ageBand(c.ageYears)}`, { t: `Carregado ${formatDate(c.createdAt)}`, minor: true }, { t: region, minor: true }],
        tr: [
          `${MODALITY_SHORT[series.modality]} · ${series.dicomMeta?.Modality ?? MODALITY_DICOM[series.modality]}`,
          `Série ${seriesNumber}${series.view || series.description ? ` · ${series.view ?? series.description}` : ''}`,
          isVideo ? { t: `Vídeo · ${n} fotogramas-chave`, minor: true } : multi ? { t: `Img ${frameIndex + 1}/${n}`, minor: false } : { t: `Img 1/1`, minor: true },
        ],
        bl: [
          `J ${Math.round(view.ww)} N ${Math.round(view.wc)}`,
          { t: [`Zoom ${fmtNum(geom.s, 2)}×`, ...transforms].join(' · '), minor: true },
          ...(measuring && !sp ? [{ t: 'Sem calibração — medições em píxeis', minor: true }] : []),
        ],
        br: [
          ...(multi ? [`Fotograma ${frameIndex + 1}/${n}`] : []),
          ...(t !== undefined ? [`${fmtClock(t)}${total ? ` / ${fmtClock(total)}` : ''}`] : []),
          ...(sp ? [{ t: `${fmtNum(sp[1], 2)} mm/px${frame?.pixelSpacingSource === 'detector' ? ' (detetor)' : ''}`, minor: true }] : []),
        ],
      }
    : null

  const cursor = dragging
    ? tool === 'pan' ? 'grabbing' : undefined
    : hoverBox && tool === 'pan'
      ? 'pointer'
      : tool === 'pan'
        ? 'grab'
        : tool === 'zoom'
          ? 'zoom-in'
          : tool === 'wl'
            ? 'ns-resize'
            : 'crosshair'

  const navigableHere = props.navTotal
  // Keep the label pills clear of the AI chip and the corner text.
  const chipRef = useRef<HTMLDivElement>(null)
  const cornerRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [avoid, setAvoid] = useState<Rect[]>([])
  const avoidKey = useRef('')
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const hr = host.getBoundingClientRect()
    const rects = [chipRef.current, ...Object.values(cornerRefs.current)]
      .filter((el): el is HTMLDivElement => !!el)
      .map((el) => {
        const r = el.getBoundingClientRect()
        return { x: r.left - hr.left - 3, y: r.top - hr.top - 3, w: r.width + 6, h: r.height + 6 }
      })
      .filter((r) => r.w > 8 && r.h > 8)
    const key = rects.map((r) => [r.x, r.y, r.w, r.h].map(Math.round).join(',')).join(';')
    if (key !== avoidKey.current) {
      avoidKey.current = key
      setAvoid(rects)
    }
  })
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), [])
  const aiTitle = aiVisible ? 'Ocultar achados da IA (A)' : 'Achados da IA ocultos. Prima A para mostrar.'

  return (
    <div className="vw">
      <ViewerToolbar
        tool={tool}
        onTool={setTool}
        invert={view.invert}
        flipH={view.flipH}
        flipV={view.flipV}
        onRotate={rotate}
        onFlipH={() => setView((v) => ({ ...v, flipH: !v.flipH }))}
        onFlipV={() => setView((v) => ({ ...v, flipV: !v.flipV }))}
        onInvert={() => setView((v) => ({ ...v, invert: !v.invert }))}
        onFit={fit}
        onReset={resetView}
        presets={presets}
        onPreset={(i) => presets[i]?.apply()}
        ai={hasAnalysis ? { visible: aiVisible, count: navigableHere, onToggle: props.onToggleAi } : undefined}
        opacity={opacity}
        onOpacity={setOpacity}
        showText={showText}
        onToggleText={() => setShowText((s) => !s)}
        clip={series?.videoUrl ? { shown: showClip, onToggle: () => setShowClip((s) => !s) } : undefined}
        hasMeasurements={measurements.length > 0}
        onClearMeasurements={() => setHist({ items: [], redo: [] })}
        onCapture={capture}
        onShortcuts={() => setShortcutsOpen(true)}
      />

      <div
        ref={hostRef}
        className={`vw-stage ${showText ? '' : 'no-text'}`}
        tabIndex={0}
        role="application"
        aria-roledescription="visualizador de imagem"
        aria-label={`Imagem: ${series ? `${MODALITY_LABEL[series.modality]}, série ${seriesNumber}${multi ? `, imagem ${frameIndex + 1} de ${n}` : ''}` : 'sem imagens'}. Arraste para deslocar; dois dedos para zoom. Prima ? para ver os atalhos.`}
        style={{ cursor }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse' && !gesture.current) {
            setHoverBox(false)
            if (hoveredId) props.onHover(undefined)
          }
        }}
      >
        <canvas ref={canvasRef} aria-hidden />
        <FindingsOverlay
          items={overlayItems}
          width={size.w}
          height={size.h}
          avoid={avoid}
          opacity={opacity}
          selectedId={selectedId}
          hoveredId={hoveredId}
          pulseKey={pulse}
          onSelect={props.onSelectFinding}
          onHover={props.onHover}
        />
        {showClip && series?.videoUrl && (
          <video ref={videoRef} className="vw-clip" src={series.videoUrl} controls autoPlay loop muted playsInline onPointerDown={(e) => e.stopPropagation()} />
        )}
        {!series && <div className="viewer-empty">Sem imagens neste caso</div>}
        {corners && showText && !showClip && (
          <>
            {(['tl', 'tr', 'bl', 'br'] as const).map((pos) => (
              <div
                key={pos}
                ref={(el) => {
                  cornerRefs.current[pos] = el
                }}
                className={`vw-corner vw-${pos}`}
                aria-hidden
              >
                {corners[pos].map((line, i) => {
                  const text = typeof line === 'string' ? line : line.t
                  const minor = typeof line !== 'string' && line.minor
                  return text ? (
                    <div key={i} className={minor ? 'minor' : undefined}>
                      {text}
                    </div>
                  ) : null
                })}
              </div>
            ))}
          </>
        )}
        {hasAnalysis && !showClip && (
          <div ref={chipRef} className="vw-aichip" role="group" aria-label="Achados da IA" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" className="vw-aichip-toggle" aria-pressed={aiVisible} title={aiTitle} onClick={props.onToggleAi}>
              {aiVisible ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
              <span>
                {props.navTotal > 0
                  ? `IA ${aiVisible ? 'visível' : 'oculta'} · ${props.navTotal}`
                  : c.status === 'analysing'
                    ? 'IA · a analisar…'
                    : c.status === 'error'
                      ? 'IA · análise falhou'
                      : isTriageOnly(c.analysis)
                        ? 'IA · só triagem'
                        : studyClass(c.analysis) === 'negative'
                        ? 'IA · sem achados'
                        : studyClass(c.analysis) === 'not-assessable'
                          ? 'IA · não avaliável'
                          : 'IA · sem marcações'}
              </span>
            </button>
            {props.navTotal > 0 && (
              <>
                <button type="button" className="vw-aichip-nav" aria-label="Achado anterior (Shift+N)" title="Achado anterior (Shift+N)" onClick={() => props.onNavigate(-1)}>
                  <ChevronLeft size={15} />
                </button>
                <span className="vw-aichip-count mono" aria-label={`Achado ${props.navIndex >= 0 ? props.navIndex + 1 : 'nenhum'} de ${props.navTotal}`}>
                  {props.navIndex >= 0 ? props.navIndex + 1 : '–'}/{props.navTotal}
                </span>
                <button type="button" className="vw-aichip-nav" aria-label="Achado seguinte (N)" title="Achado seguinte (N)" onClick={() => props.onNavigate(1)}>
                  <ChevronRight size={15} />
                </button>
              </>
            )}
          </div>
        )}
        {draft?.kind === 'angle' && draft.phase === 2 && <div className="vw-hint">Marque o terceiro ponto do ângulo</div>}
      </div>

      {multi && series && (
        <CineBar
          series={series}
          frameIndex={frameIndex}
          onFrameIndex={(i) => {
            onFrameIndex(i)
          }}
          playing={playing}
          onTogglePlay={togglePlay}
          speed={speed}
          onSpeed={setSpeed}
          repeat={repeat}
          onRepeat={() => setRepeat((r) => !r)}
          spans={cineSpans}
          selectedId={selectedId}
          onSelectSpan={props.onSelectFinding}
          loopRange={loop}
          loopLabel={loopLabel}
          onClearLoop={() => setLoopRange(undefined)}
        />
      )}

      <ShortcutsDialog open={shortcutsOpen} onClose={closeShortcuts} />
    </div>
  )
}
