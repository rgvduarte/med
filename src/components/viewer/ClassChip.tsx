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

/** Status chip: shape + upper-case text + colour, never colour alone. */
export function ClassChip({ cls, small, text }: { cls: FindingClass; small?: boolean; text?: string }) {
  const tone = cls === 'positive' ? 'pos' : cls === 'doubtful' ? 'dub' : cls === 'negative' ? 'neg' : 'na'
  return (
    <span className={`cls-chip cls-${tone} ${small ? 'cls-chip-sm' : ''}`} title={CLASS_LABEL[cls]}>
      <ClassGlyph cls={cls} size={small ? 11 : 12} />
      {text ?? CLASS_CHIP[cls]}
    </span>
  )
}
