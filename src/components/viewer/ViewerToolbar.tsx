import { useRef, useState, type ReactNode } from 'react'
import {
  Angle,
  ArrowLeftRight,
  ArrowUpDown,
  Camera,
  ChevronDown,
  Contrast,
  EllipsisVertical,
  Eraser,
  Film,
  Keyboard,
  Layers,
  Move,
  RefreshCcw,
  RotateCcw,
  RotateCw,
  Ruler,
  Scan,
  Sparkles,
  SunMedium,
  Type,
  ZoomIn,
} from 'lucide-react'
import { Popover } from './Popover'

export type Tool = 'pan' | 'zoom' | 'wl' | 'length' | 'angle'

export interface WlPreset {
  key: string
  label: string
  detail?: string
}

interface Props {
  tool: Tool
  onTool: (t: Tool) => void
  invert: boolean
  flipH: boolean
  flipV: boolean
  onRotate: (dir: 1 | -1) => void
  onFlipH: () => void
  onFlipV: () => void
  onInvert: () => void
  onFit: () => void
  onReset: () => void
  presets: WlPreset[]
  onPreset: (index: number) => void
  ai?: { visible: boolean; count: number; onToggle: () => void }
  opacity: number
  onOpacity: (v: number) => void
  showText: boolean
  onToggleText: () => void
  clip?: { shown: boolean; onToggle: () => void }
  hasMeasurements: boolean
  onClearMeasurements: () => void
  onCapture: () => void
  onShortcuts: () => void
}

const ICON = { size: 18, strokeWidth: 1.75 }

function ToolBtn({
  label,
  k,
  icon,
  pressed,
  onClick,
  className = '',
}: {
  label: string
  k?: string
  icon: ReactNode
  pressed?: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      className={`vt-btn ${className}`}
      aria-pressed={pressed}
      aria-label={label}
      aria-keyshortcuts={k}
      title={k ? `${label} (${k})` : label}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}

export function ViewerToolbar(p: Props) {
  const [menu, setMenu] = useState<'wl' | 'opacity' | 'more' | null>(null)
  const wlRef = useRef<HTMLButtonElement>(null)
  const opRef = useRef<HTMLButtonElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const close = () => setMenu(null)
  const toggle = (m: 'wl' | 'opacity' | 'more') => setMenu((cur) => (cur === m ? null : m))
  const run = (fn: () => void) => () => {
    fn()
    close()
  }
  const opacityPct = Math.round(p.opacity * 100)

  const opacitySlider = (
    <label className="vt-slider">
      <span>Opacidade da IA</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={opacityPct}
        onChange={(e) => p.onOpacity(Number(e.target.value) / 100)}
        aria-valuetext={`${opacityPct}%`}
      />
      <output className="mono">{opacityPct}%</output>
    </label>
  )

  return (
    <div className="vt no-print" role="toolbar" aria-label="Ferramentas do visualizador">
      <div className="vt-group" role="group" aria-label="Navegar">
        <ToolBtn label="Deslocar" k="P" icon={<Move {...ICON} />} pressed={p.tool === 'pan'} onClick={() => p.onTool('pan')} />
        <ToolBtn label="Zoom" k="Z" icon={<ZoomIn {...ICON} />} pressed={p.tool === 'zoom'} onClick={() => p.onTool('zoom')} className="vt-hide-xs" />
        <span className="vt-split">
          <ToolBtn label="Janela/Nível" k="W" icon={<SunMedium {...ICON} />} pressed={p.tool === 'wl'} onClick={() => p.onTool('wl')} />
          {p.presets.length > 0 && (
            <button
              ref={wlRef}
              type="button"
              className="vt-caret"
              aria-label="Predefinições de janela/nível"
              aria-haspopup="menu"
              aria-expanded={menu === 'wl'}
              title="Predefinições de janela/nível (1–5)"
              onClick={() => toggle('wl')}
            >
              <ChevronDown size={14} strokeWidth={2} />
            </button>
          )}
          <Popover open={menu === 'wl'} onClose={close} anchorRef={wlRef} label="Predefinições de janela/nível">
            {p.presets.map((pr, i) => (
              <button key={pr.key} type="button" role="menuitem" className="vt-item" onClick={run(() => p.onPreset(i))}>
                <span>{pr.label}</span>
                {pr.detail && <span className="vt-item-detail mono">{pr.detail}</span>}
                <kbd className="kbd">{i + 1}</kbd>
              </button>
            ))}
          </Popover>
        </span>
      </div>

      <span className="vt-sep" aria-hidden />
      <div className="vt-group" role="group" aria-label="Medir">
        <ToolBtn label="Distância" k="M" icon={<Ruler {...ICON} />} pressed={p.tool === 'length'} onClick={() => p.onTool('length')} />
        <ToolBtn label="Ângulo" k="G" icon={<Angle {...ICON} />} pressed={p.tool === 'angle'} onClick={() => p.onTool('angle')} className="vt-hide-xs" />
      </div>

      <span className="vt-sep vt-desktop" aria-hidden />
      <div className="vt-group vt-desktop" role="group" aria-label="Transformar">
        <ToolBtn label="Rodar 90°" k="R" icon={<RotateCw {...ICON} />} onClick={() => p.onRotate(1)} />
        <ToolBtn label="Espelhar horizontal" k="H" icon={<ArrowLeftRight {...ICON} />} pressed={p.flipH} onClick={p.onFlipH} />
        <ToolBtn label="Espelhar vertical" k="V" icon={<ArrowUpDown {...ICON} />} pressed={p.flipV} onClick={p.onFlipV} />
        <ToolBtn label="Inverter cores" k="I" icon={<Contrast {...ICON} />} pressed={p.invert} onClick={p.onInvert} />
      </div>

      <span className="vt-sep" aria-hidden />
      <div className="vt-group" role="group" aria-label="Vista">
        <ToolBtn label="Ajustar ao ecrã" k="=" icon={<Scan {...ICON} />} onClick={p.onFit} />
        <ToolBtn label="Repor" k="0" icon={<RefreshCcw {...ICON} />} onClick={p.onReset} className="vt-desktop" />
      </div>

      {p.ai && (
        <>
          <span className="vt-sep vt-desktop" aria-hidden />
          <div className="vt-group vt-desktop" role="group" aria-label="Inteligência artificial">
            <button
              type="button"
              className="vt-btn vt-btn-text vt-ai"
              aria-pressed={p.ai.visible}
              aria-keyshortcuts="A"
              title={`${p.ai.visible ? 'Ocultar' : 'Mostrar'} achados da IA (A)`}
              onClick={p.ai.onToggle}
            >
              <Sparkles {...ICON} />
              <span>IA · {p.ai.count}</span>
              <span className={`vt-state-dot ${p.ai.visible ? 'on' : ''}`} aria-hidden />
              <span className="sr-only">{p.ai.visible ? '(visível)' : '(oculta)'}</span>
            </button>
            <button
              ref={opRef}
              type="button"
              className="vt-btn"
              aria-label="Opacidade dos achados da IA"
              aria-haspopup="dialog"
              aria-expanded={menu === 'opacity'}
              title={`Opacidade dos achados da IA (${opacityPct}%)`}
              onClick={() => toggle('opacity')}
            >
              <Layers {...ICON} />
            </button>
            <Popover open={menu === 'opacity'} onClose={close} anchorRef={opRef} label="Opacidade dos achados da IA" role="dialog">
              {opacitySlider}
            </Popover>
          </div>
        </>
      )}

      <span className="vt-spacer" />
      <span className="vt-split">
        <button
          ref={moreRef}
          type="button"
          className="vt-btn"
          aria-label="Mais ferramentas"
          aria-haspopup="menu"
          aria-expanded={menu === 'more'}
          title="Mais"
          onClick={() => toggle('more')}
        >
          <EllipsisVertical {...ICON} />
        </button>
        <Popover open={menu === 'more'} onClose={close} anchorRef={moreRef} label="Mais ferramentas" align="end">
          <div className="vt-mobile-only vt-menu-section">
            <button type="button" role="menuitem" className="vt-item" onClick={run(() => p.onRotate(1))}>
              <RotateCw size={16} /> <span>Rodar 90° à direita</span> <kbd className="kbd">R</kbd>
            </button>
            <button type="button" role="menuitem" className="vt-item" onClick={run(() => p.onRotate(-1))}>
              <RotateCcw size={16} /> <span>Rodar 90° à esquerda</span> <kbd className="kbd">L</kbd>
            </button>
            <button type="button" role="menuitemcheckbox" aria-checked={p.flipH} className="vt-item" onClick={run(p.onFlipH)}>
              <ArrowLeftRight size={16} /> <span>Espelhar horizontal</span> <kbd className="kbd">H</kbd>
            </button>
            <button type="button" role="menuitemcheckbox" aria-checked={p.flipV} className="vt-item" onClick={run(p.onFlipV)}>
              <ArrowUpDown size={16} /> <span>Espelhar vertical</span> <kbd className="kbd">V</kbd>
            </button>
            <button type="button" role="menuitemcheckbox" aria-checked={p.invert} className="vt-item" onClick={run(p.onInvert)}>
              <Contrast size={16} /> <span>Inverter cores</span> <kbd className="kbd">I</kbd>
            </button>
            <button type="button" role="menuitem" className="vt-item" onClick={run(p.onReset)}>
              <RefreshCcw size={16} /> <span>Repor vista</span> <kbd className="kbd">0</kbd>
            </button>
            <div className="vt-xs-only">
              <button type="button" role="menuitemcheckbox" aria-checked={p.tool === 'zoom'} className="vt-item" onClick={run(() => p.onTool('zoom'))}>
                <ZoomIn size={16} /> <span>Zoom</span> <kbd className="kbd">Z</kbd>
              </button>
              <button type="button" role="menuitemcheckbox" aria-checked={p.tool === 'angle'} className="vt-item" onClick={run(() => p.onTool('angle'))}>
                <Angle size={16} /> <span>Ângulo</span> <kbd className="kbd">G</kbd>
              </button>
            </div>
            {p.ai && <div className="vt-item vt-item-static">{opacitySlider}</div>}
          </div>
          <div className="vt-desktop">
            <button type="button" role="menuitem" className="vt-item" onClick={run(() => p.onRotate(-1))}>
              <RotateCcw size={16} /> <span>Rodar 90° à esquerda</span> <kbd className="kbd">L</kbd>
            </button>
          </div>
          <button type="button" role="menuitemcheckbox" aria-checked={!p.showText} className="vt-item" onClick={run(p.onToggleText)}>
            <Type size={16} /> <span>Ocultar texto do visualizador</span> <kbd className="kbd">T</kbd>
          </button>
          {p.clip && (
            <button type="button" role="menuitemcheckbox" aria-checked={p.clip.shown} className="vt-item" onClick={run(p.clip.onToggle)}>
              <Film size={16} /> <span>Ver clip original</span>
            </button>
          )}
          {p.hasMeasurements && (
            <button type="button" role="menuitem" className="vt-item" onClick={run(p.onClearMeasurements)}>
              <Eraser size={16} /> <span>Limpar medições</span>
            </button>
          )}
          <button type="button" role="menuitem" className="vt-item" onClick={run(p.onCapture)}>
            <Camera size={16} /> <span>Capturar imagem</span>
          </button>
          <button type="button" role="menuitem" className="vt-item vt-desktop-flex" onClick={run(p.onShortcuts)}>
            <Keyboard size={16} /> <span>Atalhos de teclado</span> <kbd className="kbd">?</kbd>
          </button>
        </Popover>
      </span>
    </div>
  )
}
