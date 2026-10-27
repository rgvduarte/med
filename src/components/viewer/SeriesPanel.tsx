import { Film } from 'lucide-react'
import type { Case, Series } from '../../types'
import { MODALITY_LABEL } from '../../lib/labels'
import { MODALITY_DICOM, MODALITY_SHORT } from '../../lib/labels-findings'
import { fmtClock } from './format'
import { seriesAiStatus, seriesDuration } from './findingModel'

function SeriesAiGlyph({ c, s }: { c: Case; s: Series }) {
  const st = seriesAiStatus(c, s.id)
  if (st.kind === 'positive')
    return (
      <span className="sp-ai is-pos" title={`${st.count} achado(s) positivo(s) da IA`}>
        <span aria-hidden>■</span> {st.count}
        <span className="sr-only"> positivo(s)</span>
      </span>
    )
  if (st.kind === 'doubtful')
    return (
      <span className="sp-ai is-dub" title={`${st.count} achado(s) duvidoso(s) da IA`}>
        <span aria-hidden>▭</span> {st.count}
        <span className="sr-only"> duvidoso(s)</span>
      </span>
    )
  if (st.kind === 'negative')
    return (
      <span className="sp-ai is-neg" title="Analisada pela IA, sem achados marcados">
        <span aria-hidden>○</span>
        <span className="sr-only">sem achados</span>
      </span>
    )
  return (
    <span className="sp-ai is-none" title="Ainda não analisada">
      <span aria-hidden>·</span>
      <span className="sr-only">não analisada</span>
    </span>
  )
}

function countText(s: Series): string {
  if (s.kind === 'video') {
    const d = seriesDuration(s)
    return `Vídeo ${d ? fmtClock(d).slice(0, 5) : ''} · ${s.frames.length} fotogramas`
  }
  return s.frames.length === 1 ? '1 imagem' : `${s.frames.length} imagens`
}

/** «Séries» panel: thumbnail cards with modality, number, AI status glyph and image count. */
export function SeriesPanel({ c, activeId, onSelect }: { c: Case; activeId?: string; onSelect: (id: string) => void }) {
  return (
    <nav className="sp" aria-label="Séries">
      <h2 className="sp-title">Séries</h2>
      <ul className="sp-list">
        {c.series.map((s, i) => {
          const active = s.id === activeId
          return (
            <li key={s.id}>
              <button
                type="button"
                className="sp-card"
                aria-current={active ? 'true' : undefined}
                aria-label={`Série ${i + 1}: ${s.view ?? s.description}, ${MODALITY_LABEL[s.modality]}, ${countText(s)}`}
                title={s.description}
                onClick={() => onSelect(s.id)}
              >
                <span className="sp-thumb">
                  {s.frames[0] ? <img src={s.frames[0].url} alt="" loading="lazy" /> : null}
                  {s.kind === 'video' ? (
                    <span className="sp-badge">
                      <Film size={11} aria-hidden /> {fmtClock(seriesDuration(s)).slice(0, 5)}
                    </span>
                  ) : s.frames.length > 1 ? (
                    <span className="sp-badge">{s.frames.length}</span>
                  ) : null}
                </span>
                <span className="sp-meta">
                  <span className="sp-line">
                    <span className="sp-mod" title={`DICOM ${s.dicomMeta?.Modality ?? MODALITY_DICOM[s.modality]}`}>
                      {MODALITY_SHORT[s.modality]}
                    </span>
                    <span className="sp-num">Série {i + 1}</span>
                    <SeriesAiGlyph c={c} s={s} />
                  </span>
                  <span className="sp-desc">
                    {s.view ?? s.description} · {countText(s)}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
