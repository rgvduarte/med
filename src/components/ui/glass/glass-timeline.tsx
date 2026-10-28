import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '../cn'

export interface TimelineItem {
  id: string
  title: ReactNode
  description?: ReactNode
  date?: ReactNode
  icon?: ReactNode
  status?: 'completed' | 'current' | 'upcoming'
}

/**
 * Ein UI GlassTimeline (vertical): glowing node per step, gradient connector, glass card per item.
 * `accent` lights every connector and icon (a process description, with no progress state).
 */
export function GlassTimeline({ items, className, accent = false }: { items: TimelineItem[]; className?: string; accent?: boolean }) {
  return (
    <ol className={cn('relative m-0 list-none p-0', className)}>
      {items.map((item, index) => (
        <li key={item.id} className="flex gap-4 pb-6 last:pb-0">
          <div className="flex flex-col items-center">
            <TimelineNode status={item.status} icon={item.icon} accent={accent} />
            {index < items.length - 1 && (
              <div
                aria-hidden
                className={cn('mt-2 w-0.5 flex-1', accent || item.status === 'completed' ? 'bg-linear-to-b from-white/70 to-white/20' : 'bg-white/20')}
              />
            )}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <TimelineCard item={item} />
          </div>
        </li>
      ))}
    </ol>
  )
}

function TimelineNode({ status, icon, accent }: { status?: TimelineItem['status']; icon?: ReactNode; accent?: boolean }) {
  return (
    <div className="relative">
      {status === 'current' && (
        <div aria-hidden className="absolute -inset-2 animate-pulse rounded-full bg-white/30 blur-md motion-reduce:animate-none" />
      )}
      <div
        className={cn(
          'relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300',
          status === 'completed' && 'border-white/70 bg-white',
          status === 'current' && 'border-white/70 bg-white/20 backdrop-blur-xl',
          status === 'upcoming' && 'border-white/20 bg-white/5 backdrop-blur-xl',
          !status && !accent && 'border-white/20 bg-white/10 backdrop-blur-xl',
          !status && accent && 'border-white/40 bg-white/10 shadow-[0_0_16px_rgba(255,255,255,0.12)] backdrop-blur-xl',
        )}
      >
        {status === 'completed' ? (
          <Check className="h-5 w-5 text-neutral-950" aria-hidden />
        ) : icon ? (
          <span className={cn('flex text-white/80 [&_svg]:size-[18px]', (status === 'current' || accent) && 'text-white')}>{icon}</span>
        ) : (
          <div className={cn('h-3 w-3 rounded-full', status === 'current' ? 'bg-white' : 'bg-white/40')} />
        )}
      </div>
    </div>
  )
}

function TimelineCard({ item }: { item: TimelineItem }) {
  const isCurrent = item.status === 'current'
  return (
    <div className="relative">
      {isCurrent && <div aria-hidden className="absolute -inset-1 rounded-xl bg-white/15 opacity-70 blur-lg" />}
      <div
        className={cn(
          'relative rounded-xl border p-4 backdrop-blur-xl transition-all duration-300',
          isCurrent ? 'border-white/30 bg-white/15' : 'border-white/10 bg-white/5 hover:bg-white/10',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <h4 className="m-0 font-medium text-white">{item.title}</h4>
          {item.date && <span className="shrink-0 text-xs text-white/50">{item.date}</span>}
        </div>
        {item.description && <div className="mt-2 text-sm leading-relaxed text-white/65">{item.description}</div>}
      </div>
    </div>
  )
}
