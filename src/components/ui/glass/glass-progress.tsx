import type { ComponentProps } from 'react'
import { Progress } from 'radix-ui'
import { cn } from '../cn'

export function GlassProgress({ className, wrapperClassName, value, max = 100, ...props }: ComponentProps<typeof Progress.Root> & { wrapperClassName?: string }) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <div aria-hidden className="pointer-events-none absolute -inset-1 rounded-full bg-white/10 opacity-50 blur-md" />
      <Progress.Root
        className={cn('relative h-3 w-full overflow-hidden rounded-full', 'border border-white/20 bg-white/10 backdrop-blur-xl', className)}
        value={value}
        max={max}
        {...props}
      >
        <Progress.Indicator
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out motion-reduce:transition-none',
            'bg-white',
            'shadow-[0_0_12px_rgba(255,255,255,0.45)]',
          )}
          style={{ width: `${max > 0 ? ((value ?? 0) / max) * 100 : 0}%` }}
        />
      </Progress.Root>
    </div>
  )
}
