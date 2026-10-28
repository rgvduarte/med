import type { ComponentProps } from 'react'
import { Switch } from 'radix-ui'
import { cn } from '../cn'

export function GlassSwitch({ className, ...props }: ComponentProps<typeof Switch.Root>) {
  return (
    <Switch.Root
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full',
        'border border-white/20 transition-all duration-300',
        'bg-white/10 backdrop-blur-xl',
        'focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-white data-[state=checked]:bg-white',
        'data-[state=checked]:shadow-[0_0_12px_rgba(255,255,255,0.3)]',
        className,
      )}
      {...props}
    >
      <Switch.Thumb
        className={cn(
          'pointer-events-none block h-5 w-5 rounded-full',
          'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.3)] data-[state=checked]:bg-neutral-950',
          'transition-transform duration-300 motion-reduce:transition-none',
          'data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5',
        )}
      />
    </Switch.Root>
  )
}
