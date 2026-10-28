import type { ComponentProps } from 'react'
import { Progress } from 'radix-ui'
import { cn } from '../cn'

export function GlassProgress({ className, wrapperClassName, value, max = 100, ...props }: ComponentProps<typeof Progress.Root> & { wrapperClassName?: string }) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <div aria-hidden className="pointer-events-none absolute -inset-1 rounded-full bg-linear-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20 opacity-50 blur-md" />
      <Progress.Root
        className={cn('relative h-3 w-full overflow-hidden rounded-full', 'border border-white/20 bg-white/10 backdrop-blur-xl', className)}
        value={value}
        max={max}
        {...props}
      >
        <Progress.Indicator
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out motion-reduce:transition-none',
            'bg-linear-to-r from-cyan-400 via-blue-400 to-purple-400',
            'shadow-[0_0_12px_rgba(59,130,246,0.5)]',
          )}
          style={{ width: `${max > 0 ? ((value ?? 0) / max) * 100 : 0}%` }}
        />
      </Progress.Root>
    </div>
  )
}
