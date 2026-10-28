import type { ComponentProps } from 'react'
import { Tooltip } from 'radix-ui'
import { cn } from '../cn'

export const GlassTooltipProvider = Tooltip.Provider
export const GlassTooltip = Tooltip.Root
export const GlassTooltipTrigger = Tooltip.Trigger

export function GlassTooltipContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof Tooltip.Content>) {
  return (
    <Tooltip.Portal>
      <Tooltip.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-w-72 overflow-hidden rounded-lg px-3 py-1.5',
          'border border-white/20 bg-[rgba(20,20,20,0.88)] backdrop-blur-xl',
          'text-xs text-white shadow-[0_4px_16px_rgba(0,0,0,0.3)]',
          'animate-in fade-in-0 zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
          'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          className,
        )}
        {...props}
      />
    </Tooltip.Portal>
  )
}
