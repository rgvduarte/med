import type { ComponentProps } from 'react'
import { cn } from '../cn'

/** Ein UI GlassCard: translucent white panel, top highlight, inner rim and an optional cyan→purple glow behind it. */
export function GlassCard({ className, glowEffect = true, children, ...props }: ComponentProps<'div'> & { glowEffect?: boolean }) {
  return (
    <div className="relative">
      {glowEffect && (
        <div aria-hidden className="pointer-events-none absolute -inset-1 rounded-2xl bg-linear-to-r from-cyan-500/30 via-blue-500/30 to-purple-500/30 opacity-70 blur-xl" />
      )}
      <div
        className={cn(
          'relative rounded-2xl border border-white/20',
          'bg-white/10 backdrop-blur-xl',
          'shadow-[0_8px_32px_rgba(0,0,0,0.37)]',
          'before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl',
          'before:bg-linear-to-b before:from-white/20 before:to-transparent',
          'after:pointer-events-none after:absolute after:inset-px after:rounded-[calc(1rem-1px)]',
          'after:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]',
          className,
        )}
        {...props}
      >
        <div className="relative z-10">{children}</div>
      </div>
    </div>
  )
}

export function GlassCardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />
}

export function GlassCardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 className={cn('text-xl leading-none font-semibold tracking-tight text-white', className)} {...props} />
}

export function GlassCardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-white/60', className)} {...props} />
}

export function GlassCardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-6 pt-0', className)} {...props} />
}

export function GlassCardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center p-6 pt-0', className)} {...props} />
}
