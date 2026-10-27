import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { Pause, Play, Repeat, SkipBack, SkipForward, StepBack, StepForward, X } from 'lucide-react'
import type { FindingClass, Series } from '../../types'
import { CLASS_LABEL } from '../../lib/labels-findings'
import { fmtClock } from './format'
import { framePosition, seriesDuration } from './findingModel'

export interface CineSpan {
  id: string
  code: string
  label: string
  cls: FindingClass
  range: [number, number]
}

interface Props {
  series: Series
  frameIndex: number
  onFrameIndex: (i: number) => void
  playing: boolean
  onTogglePlay: () => void
  speed: number
  onSpeed: (s: number) => void
  repeat: boolean
  onRepeat: () => void
  spans: CineSpan[]
  selectedId?: string
  onSelectSpan: (id: string) => void
  loopRange?: [number, number]
  loopLabel?: string
  onClearLoop: () => void
}

const SPEEDS = [0.25, 0.5, 1, 2] as const

const ICON = { size: 17, strokeWidth: 1.75 }

export function CineBar(p: Props) {
  const { series, frameIndex } = p
  const n = series.frames.length
  const trackRef = useRef<HTMLDivElement>(null)
  const scrubbing = useRef(false)
  const isVideo = series.kind === 'video'
  const total = seriesDuration(series)
  const t = series.frames[frameIndex]?.timeSec
  const pos = (i: number) => framePosition(series, i) * 100

  const indexAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)))
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < n; i++) {
      const d = Math.abs(framePosition(series, i) - x)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    scrubbing.current = true
    p.onFrameIndex(indexAt(e.clientX))
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (scrubbing.current) p.onFrameIndex(indexAt(e.clientX))
  }
  const onUp = () => {
    scrubbing.current = false
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, frameIndex - 1)
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(n - 1, frameIndex + 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    if (next === null) return
    e.preventDefault()
    e.stopPropagation()
    p.onFrameIndex(next)
  }

  const timeText = t !== undefined ? `${fmtClock(t)}${total ? ` / ${fmtClock(total)}` : ''}` : ''
  const valueText = `Fotograma ${frameIndex + 1} de ${n}${t !== undefined ? `, ${fmtClock(t)}` : ''}`

  return (
    <div className="cb no-print" role="group" aria-label="Controlo de cine">
      <div className="cb-row">
        <button type="button" className="vt-btn cb-hide-sm" aria-label="Primeiro fotograma" title="Primeiro fotograma (Home)" onClick={() => p.onFrameIndex(0)}>
          <SkipBack {...ICON} />
        </button>
        <button type="button" className="vt-btn" aria-label="Fotograma anterior" title="Fotograma anterior (←)" onClick={() => p.onFrameIndex(Math.max(0, frameIndex - 1))}>
          <StepBack {...ICON} />
        </button>
        <button
          type="button"
          className="vt-btn cb-play"
          aria-label={p.playing ? 'Pausa' : 'Reproduzir'}
          title={`${p.playing ? 'Pausa' : 'Reproduzir'} (Espaço)`}
          onClick={p.onTogglePlay}
        >
          {p.playing ? <Pause {...ICON} /> : <Play {...ICON} />}
        </button>
        <button type="button" className="vt-btn" aria-label="Fotograma seguinte" title="Fotograma seguinte (→)" onClick={() => p.onFrameIndex(Math.min(n - 1, frameIndex + 1))}>
          <StepForward {...ICON} />
        </button>
        <button type="button" className="vt-btn cb-hide-sm" aria-label="Último fotograma" title="Último fotograma (End)" onClick={() => p.onFrameIndex(n - 1)}>
          <SkipForward {...ICON} />
        </button>
        <select className="cb-speed" aria-label="Velocidade de reprodução" value={p.speed} onChange={(e) => p.onSpeed(Number(e.target.value))}>
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {String(s).replace('.', ',')}×
            </option>
          ))}
        </select>
        <button type="button" className="vt-btn" aria-pressed={p.repeat} aria-label="Repetir" title="Repetir em ciclo" onClick={p.onRepeat}>
          <Repeat {...ICON} />
        </button>
        {p.loopRange && (
          <span className="cb-loop">
            <span>Ciclo {p.loopLabel}</span>
            <button type="button" aria-label="Terminar ciclo do achado" title="Terminar ciclo do achado" onClick={p.onClearLoop}>
              <X size={12} />
            </button>
          </span>
        )}
        <span className="cb-time mono">
          <span className="cb-time-full">{timeText}</span>
          <span className="cb-frame">
            <span className="cb-frame-word">Fotograma </span>
            {frameIndex + 1}/{n}
          </span>
        </span>
      </div>
      <div
        ref={trackRef}
        className="cb-track"
        role="slider"
        tabIndex={0}
        aria-label="Linha temporal"
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={frameIndex + 1}
        aria-valuetext={valueText}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
      >
        <div className="cb-rail" />
        {p.loopRange && (
          <div className="cb-looprange" style={{ left: `${pos(p.loopRange[0])}%`, width: `${Math.max(0.8, pos(p.loopRange[1]) - pos(p.loopRange[0]))}%` }} />
        )}
        {p.spans.map((s) => {
          const a = pos(Math.max(0, Math.min(n - 1, s.range[0])))
          const b = pos(Math.max(0, Math.min(n - 1, s.range[1])))
          return (
            <button
              key={s.id}
              type="button"
              tabIndex={-1}
              className={`cb-span ${s.cls === 'positive' ? 'is-pos' : 'is-dub'} ${s.id === p.selectedId ? 'is-sel' : ''}`}
              style={{ left: `${a}%`, width: `${Math.max(1.2, b - a)}%` }}
              title={`${s.code} · ${s.label} — ${CLASS_LABEL[s.cls]} · fotogramas ${s.range[0] + 1}–${s.range[1] + 1}`}
              aria-label={`${s.code} ${s.label}`}
              onClick={() => p.onSelectSpan(s.id)}
            />
          )
        })}
        {isVideo &&
          series.frames.map((f, i) => (
            <span
              key={f.id}
              className={`cb-key ${i === frameIndex ? 'is-cur' : ''}`}
              style={{ left: `${pos(i)}%` }}
              title={`Fotograma analisado pela IA · ${fmtClock(f.timeSec)}`}
              aria-hidden
            />
          ))}
        <span className="cb-head" style={{ left: `${pos(frameIndex)}%` }} aria-hidden />
      </div>
    </div>
  )
}
