import { CircleMinus, CircleQuestionMark, Square, SquareDashed } from 'lucide-react'
import type { FindingClass } from '../../types'
import { CLASS_CHIP, CLASS_LABEL } from '../../lib/labels-findings'

/** Shape glyph for a finding class: ■ positive, dashed square doubtful, ⊖ negative, ? not assessable. */
export function ClassGlyph({ cls, size = 14 }: { cls: FindingClass; size?: number }) {
  if (cls === 'positive') return <Square size={size} fill="currentColor" strokeWidth={2} aria-hidden className="cls-glyph is-pos" />
  if (cls === 'doubtful') return <SquareDashed size={size} strokeWidth={2} aria-hidden className="cls-glyph is-dub" />
  if (cls === 'negative') return <CircleMinus size={size} strokeWidth={2} aria-hidden className="cls-glyph is-neg" />
  return <CircleQuestionMark size={size} strokeWidth={2} aria-hidden className="cls-glyph is-na" />
}

/**
 * Status chip: shape + upper-case text + colour, never colour alone.
 * `ai` marks a study-level AI result with a visible «IA» tag (and «Resultado da IA:» for screen readers).
 */
export function ClassChip({ cls, small, text, ai }: { cls: FindingClass; small?: boolean; text?: string; ai?: boolean }) {
  const tone = cls === 'positive' ? 'pos' : cls === 'doubtful' ? 'dub' : cls === 'negative' ? 'neg' : 'na'
  return (
    <span className={`cls-chip cls-${tone} ${small ? 'cls-chip-sm' : ''}`} title={ai ? `Resultado da IA: ${CLASS_LABEL[cls]} — verificar` : CLASS_LABEL[cls]}>
      {ai && (
        <span className="cls-chip-ai" aria-hidden>
          IA
        </span>
      )}
      <ClassGlyph cls={cls} size={small ? 11 : 12} />
      {ai && <span className="sr-only">Resultado da IA: </span>}
      {text ?? CLASS_CHIP[cls]}
    </span>
  )
}
