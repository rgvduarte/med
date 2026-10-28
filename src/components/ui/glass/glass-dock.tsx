import type { ReactNode } from 'react'
import { cn } from '../cn'

export interface DockItem {
  id: string
  icon: ReactNode
  label: string
  href: string
  active?: boolean
}

/**
 * Ein UI GlassDock as the phone navigation bar: floating glass pill, layered highlights, glowing active item.
 * Labels stay visible (touch has no hover tooltip) and there is no pointer magnification.
 */
export function GlassDock({ items, className, label }: { items: DockItem[]; className?: string; label: string }) {
  return (
    <nav aria-label={label} className={cn('relative', className)}>
      <div aria-hidden className="pointer-events-none absolute -inset-x-4 -inset-y-6 rounded-3xl bg-linear-to-r from-cyan-500/25 via-blue-500/20 to-purple-500/25 opacity-60 blur-2xl" />
      <div
        className={cn(
          'relative grid grid-flow-col auto-cols-fr gap-2 rounded-2xl border border-white/25 px-2 py-2',
          'bg-[rgba(18,24,40,0.72)] backdrop-blur-3xl',
          'shadow-[0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,255,255,0.2),inset_0_-1px_1px_rgba(0,0,0,0.1)]',
        )}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl bg-linear-to-b from-white/15 via-white/5 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/40 to-transparent" />
        {items.map((item) => (
          <a
            key={item.id}
            href={item.href}
            aria-current={item.active ? 'page' : undefined}
            className={cn(
              'relative flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-semibold text-white/65 no-underline transition-all duration-200',
              'hover:bg-white/10 hover:text-white hover:no-underline',
              item.active && 'border border-white/30 bg-white/15 text-white shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.3)]',
            )}
          >
            {item.active && <div aria-hidden className="absolute -inset-1 -z-10 rounded-2xl bg-linear-to-r from-cyan-500/40 to-blue-500/40 blur-md" />}
            <span className={cn('flex [&_svg]:size-5', item.active && 'text-cyan-300')}>{item.icon}</span>
            <span>{item.label}</span>
          </a>
        ))}
      </div>
    </nav>
  )
}
