import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '../cn'

const glassButtonVariants = cva(
  cn(
    'relative inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl whitespace-nowrap',
    'text-sm font-medium transition-all duration-300 ease-out',
    'focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:outline-none',
    'disabled:pointer-events-none disabled:opacity-50',
    'hover:scale-105 active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    'hover:no-underline',
  ),
  {
    variants: {
      variant: {
        default: cn(
          'border border-white/30 bg-white/20 text-white backdrop-blur-xl',
          'shadow-[0_4px_16px_rgba(0,0,0,0.2)]',
          'hover:border-white/40 hover:bg-white/30',
          'before:pointer-events-none before:absolute before:inset-0 before:rounded-xl',
          'before:bg-linear-to-b before:from-white/20 before:to-transparent',
        ),
        primary: cn(
          'bg-linear-to-r from-cyan-500/80 via-blue-500/80 to-purple-500/80',
          'border border-white/30 text-white backdrop-blur-xl',
          'shadow-[0_4px_20px_rgba(59,130,246,0.4)]',
          'hover:shadow-[0_4px_30px_rgba(59,130,246,0.6)]',
          'before:pointer-events-none before:absolute before:inset-0 before:rounded-xl',
          'before:bg-linear-to-b before:from-white/30 before:to-transparent',
        ),
        outline: cn('border-2 border-white/40 bg-transparent text-white backdrop-blur-sm', 'hover:border-white/60 hover:bg-white/10'),
        ghost: cn('bg-transparent text-white/70', 'hover:bg-white/10 hover:text-white'),
        destructive: cn(
          'border border-red-400/40 bg-red-500/30 text-red-100 backdrop-blur-xl',
          'shadow-[0_4px_16px_rgba(239,68,68,0.3)]',
          'hover:border-red-400/60 hover:bg-red-500/40',
          'before:pointer-events-none before:absolute before:inset-0 before:rounded-xl',
          'before:bg-linear-to-b before:from-white/10 before:to-transparent',
        ),
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export type GlassButtonProps = ComponentProps<'button'> & VariantProps<typeof glassButtonVariants> & { glowEffect?: boolean; asChild?: boolean }

/** Ein UI GlassButton. `asChild` renders the child element (e.g. an <a>) with the button styling. */
export function GlassButton({ className, variant, size, asChild = false, glowEffect = false, children, ...props }: GlassButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'
  const button = (
    <Comp className={cn(glassButtonVariants({ variant, size }), className)} {...props}>
      {asChild ? children : <span className="relative z-10 flex items-center gap-2">{children}</span>}
    </Comp>
  )
  if (!glowEffect) return button
  return (
    <div className="group relative inline-block">
      <div aria-hidden className="pointer-events-none absolute -inset-1 rounded-xl bg-linear-to-r from-cyan-500/40 via-blue-500/40 to-purple-500/40 opacity-70 blur-lg transition-opacity group-hover:opacity-100" />
      {button}
    </div>
  )
}
