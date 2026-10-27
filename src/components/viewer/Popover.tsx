import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react'

const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], input, select, button:not([disabled])'

interface Props {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  label: string
  children: ReactNode
  /** "menu" gets arrow-key navigation between items. */
  role?: 'menu' | 'dialog'
  align?: 'start' | 'end'
  className?: string
}

/** Anchored popover: closes on outside press and Escape (returning focus to the trigger). */
export function Popover({ open, onClose, anchorRef, label, children, role = 'menu', align = 'start', className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchorRef.current?.contains(t)) return
      closeRef.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      closeRef.current()
      anchorRef.current?.focus()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    ref.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, anchorRef])

  if (!open) return null

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (role !== 'menu' || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [])
    if (!items.length) return
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
    items[next].focus()
    e.preventDefault()
  }

  return (
    <div ref={ref} className={`vt-pop vt-pop-${align} ${className}`} role={role} aria-label={label} onKeyDown={onKeyDown}>
      {children}
    </div>
  )
}
