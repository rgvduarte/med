import type { ComponentProps } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../cn'

const field = cn(
  'relative w-full rounded-xl px-4 py-2 text-sm',
  'border border-white/20 bg-white/10 backdrop-blur-xl',
  'text-white placeholder:text-white/60',
  'shadow-[0_4px_16px_rgba(0,0,0,0.2)]',
  'transition-all duration-300',
  'focus:border-white/40 focus:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
  'disabled:cursor-not-allowed disabled:opacity-50',
)

/** Focus glow behind a field (Ein UI glowOnFocus). */
function FocusGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -inset-0.5 rounded-xl bg-white/0 opacity-0 blur-md transition-all duration-300 group-focus-within:bg-white/15 group-focus-within:opacity-70"
    />
  )
}

export function GlassInput({ className, wrapperClassName, glowOnFocus = true, ...props }: ComponentProps<'input'> & { glowOnFocus?: boolean; wrapperClassName?: string }) {
  return (
    <div className={cn('group relative', wrapperClassName)}>
      {glowOnFocus && <FocusGlow />}
      <input className={cn(field, 'flex h-10', className)} {...props} />
    </div>
  )
}

/**
 * Ein UI GlassSelect look on a native <select>: the Radix Select injects a <style> element (blocked by this
 * app's CSP) and the native picker is the better control on phones anyway.
 */
export function GlassSelect({ className, wrapperClassName, ...props }: ComponentProps<'select'> & { wrapperClassName?: string }) {
  return (
    <div className={cn('group relative', wrapperClassName)}>
      <FocusGlow />
      <select className={cn(field, 'flex h-10 cursor-pointer appearance-none pr-9 [&>option]:bg-[#161616] [&>option]:text-white', className)} {...props} />
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-white/60" />
    </div>
  )
}
