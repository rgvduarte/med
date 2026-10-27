import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: 'Ferramentas',
    keys: [
      ['P', 'Deslocar'],
      ['Z', 'Zoom (+ / − passo a passo)'],
      ['W', 'Janela/Nível · 1–5 predefinições'],
      ['M', 'Distância'],
      ['G', 'Ângulo'],
      ['Esc', 'Cancelar a ferramenta atual'],
    ],
  },
  {
    title: 'Transformar e vista',
    keys: [
      ['R / L', 'Rodar 90° à direita / à esquerda'],
      ['H / V', 'Espelhar horizontal / vertical'],
      ['I', 'Inverter cores'],
      ['=', 'Ajustar ao ecrã'],
      ['0', 'Repor (mantém as medições)'],
      ['T', 'Ocultar / mostrar texto do visualizador'],
      ['Ctrl+Z / Ctrl+Y', 'Desfazer / refazer medição'],
    ],
  },
  {
    title: 'Navegação',
    keys: [
      ['↑ / ↓', 'Imagem anterior / seguinte'],
      ['PageUp / PageDown', 'Série anterior / seguinte'],
      ['Home / End', 'Primeira / última imagem'],
      ['Espaço', 'Reproduzir / pausa (cine)'],
      ['← / →', 'Fotograma anterior / seguinte (cine)'],
      ['Roda do rato', 'Percorrer imagens (Ctrl + roda: zoom)'],
    ],
  },
  {
    title: 'Achados da IA',
    keys: [
      ['A', 'Mostrar / ocultar achados da IA'],
      ['N / Shift+N', 'Achado seguinte / anterior'],
      ['Enter', 'Aceitar o achado selecionado'],
      ['X', 'Rejeitar o achado selecionado'],
      ['E', 'Editar o achado selecionado'],
      ['?', 'Esta lista de atalhos'],
    ],
  },
]

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const prevFocus = useRef<HTMLElement | null>(null)
  const closeCb = useRef(onClose)
  closeCb.current = onClose

  useEffect(() => {
    if (!open) return
    prevFocus.current = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeCb.current()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      prevFocus.current?.focus?.()
    }
  }, [open])

  if (!open) return null
  return (
    <div className="vw-modal-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="vw-modal" role="dialog" aria-modal="true" aria-labelledby="atalhos-titulo">
        <div className="vw-modal-head">
          <h2 id="atalhos-titulo">Atalhos de teclado</h2>
          <button ref={closeRef} type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Fechar" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="vw-keys">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3>{g.title}</h3>
              <dl>
                {g.keys.map(([k, v]) => (
                  <div key={k}>
                    <dt>
                      <kbd className="kbd">{k}</kbd>
                    </dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
