import { Check, Sparkles, UserRound } from 'lucide-react'
import type { Finding } from '../../types'
import { AI_HINT, APPROX_HINT, CLASS_LABEL, CONFIDENCE_WORD } from '../../lib/labels-findings'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface OverlayItem {
  key: string
  finding: Finding
  code: string
  rect: Rect
}

interface Props {
  items: OverlayItem[]
  width: number
  height: number
  /** Regions the label pills must not cover (AI chip, corner text). */
  avoid: Rect[]
  opacity: number
  selectedId?: string
  hoveredId?: string
  pulseKey: number
  onSelect: (id: string) => void
  onHover: (id: string | undefined) => void
}

const PILL_H = 22
const HANDLE = 6

let measureCtx: CanvasRenderingContext2D | null = null
function textWidth(text: string): number {
  if (!measureCtx) {
    measureCtx = document.createElement('canvas').getContext('2d')
    if (measureCtx) measureCtx.font = '600 11px "Inter Variable", Inter, system-ui, sans-serif'
  }
  return measureCtx ? measureCtx.measureText(text).width : text.length * 6.5
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

/** Outside the box's top-left corner when possible, else inside or below — never over the chip or corner text. */
function placePill(r: Rect, pw: number, W: number, H: number, avoid: Rect[]): { left: number; top: number } {
  const clampY = (t: number) => Math.max(2, Math.min(t, H - PILL_H - 2))
  const clampX = (l: number) => Math.max(2, Math.min(l, W - pw - 2))
  const tops = [r.y - PILL_H - 3, r.y + 3, r.y + r.h + 3, r.y + r.h - PILL_H - 3].map(clampY)
  for (const a of avoid) {
    const below = a.y + a.h + 3
    if (below >= r.y - PILL_H && below <= r.y + r.h) tops.push(clampY(below))
  }
  const lefts = [clampX(r.x), clampX(r.x + r.w - pw)]
  for (const top of tops)
    for (const left of lefts) if (!avoid.some((a) => overlaps({ x: left, y: top, w: pw, h: PILL_H }, a))) return { left, top }
  return { left: lefts[0], top: tops[0] }
}

/**
 * AI overlay layer drawn above the canvas: 4px dark halo under every stroke, solid = positive,
 * dashed = doubtful, «≈» label pill with the AI marker. The selected finding is drawn at 3px with
 * corner handles while every other box dims to 40%.
 */
export function FindingsOverlay({ items, width, height, avoid, opacity, selectedId, hoveredId, pulseKey, onSelect, onHover }: Props) {
  if (!width || !height) return null
  // Boxes panned completely out of view draw nothing (their pill would otherwise be clamped on screen).
  const onScreen = items.filter((o) => o.rect.x < width && o.rect.x + o.rect.w > 0 && o.rect.y < height && o.rect.y + o.rect.h > 0)
  if (!onScreen.length) return null
  const selectedHere = onScreen.some((o) => o.finding.id === selectedId)
  // Draw the selected one last so it sits on top.
  const ordered = [...onScreen].sort((a, b) => Number(a.finding.id === selectedId) - Number(b.finding.id === selectedId))

  return (
    <div className="vw-ov" style={{ opacity }} aria-hidden={false}>
      <svg className="vw-ov-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
        {ordered.map((o) => {
          const f = o.finding
          const sel = f.id === selectedId
          const hov = !sel && f.id === hoveredId
          const dim = selectedHere && !sel
          const { x, y, w, h } = o.rect
          return (
            <g
              key={sel ? `${o.key}-${pulseKey}` : o.key}
              className={`vw-ov-box ${f.cls === 'positive' ? 'is-pos' : 'is-dub'} ${sel ? 'is-sel' : ''} ${hov ? 'is-hov' : ''}`}
              opacity={dim ? 0.4 : 1}
            >
              <rect className="halo" x={x} y={y} width={w} height={h} rx={2} />
              <rect className="stroke" x={x} y={y} width={w} height={h} rx={2} />
              {sel &&
                [
                  [x, y],
                  [x + w, y],
                  [x + w, y + h],
                  [x, y + h],
                ].map(([hx, hy], i) => (
                  <rect key={i} className="handle" x={hx - HANDLE / 2} y={hy - HANDLE / 2} width={HANDLE} height={HANDLE} />
                ))}
              {sel && <rect className="pulse" x={x} y={y} width={w} height={h} rx={2} />}
            </g>
          )
        })}
      </svg>
      {ordered.map((o) => {
        const f = o.finding
        const sel = f.id === selectedId
        const dim = selectedHere && !sel
        const accepted = f.status === 'accepted' || f.status === 'edited'
        const approx = f.origin === 'ai'
        const text = `${approx ? '≈ ' : ''}${f.label}${sel ? ` · ${CONFIDENCE_WORD[f.confidence].toLowerCase()}` : ''}`
        const pw = Math.min(width - 4, 30 + textWidth(o.code) + Math.min(sel ? Infinity : 180, textWidth(text)) + (accepted ? 15 : 0))
        const { left, top } = placePill(o.rect, pw, width, height, avoid)
        const title = `${o.code} · ${f.label} — ${CLASS_LABEL[f.cls]}${approx ? ` · ${APPROX_HINT}` : ''} · ${f.origin === 'ai' ? AI_HINT : 'Achado do clínico'}`
        return (
          <button
            key={`pill-${o.key}`}
            type="button"
            tabIndex={-1}
            className={`vw-pill ${f.cls === 'positive' ? 'is-pos' : 'is-dub'} ${sel ? 'is-sel' : ''} ${f.id === hoveredId ? 'is-hov' : ''}`}
            style={{ left, top, maxWidth: Math.max(72, width - left - 4), opacity: dim ? 0.4 : 1, zIndex: sel ? 2 : 1 }}
            title={title}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onSelect(f.id)}
            onPointerEnter={() => onHover(f.id)}
            onPointerLeave={() => onHover(undefined)}
          >
            {f.origin === 'ai' ? <Sparkles size={10} className="vw-pill-ai" aria-hidden /> : <UserRound size={10} aria-hidden />}
            <span className="vw-pill-code">{o.code}</span>
            <span className="vw-pill-text">{text}</span>
            {accepted && <Check size={11} strokeWidth={2.5} className="vw-pill-ok" aria-label="Confirmado" />}
          </button>
        )
      })}
    </div>
  )
}
