'use client'

// NIGHTRIDE — route panel.
// Lists the fastest route and its alternatives (fastest first), lets the rider
// switch between them, and always carries the routing attribution. Honest
// unavailable state when the routing service cannot be reached.

import { AlertTriangle, Loader2, Navigation, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistance } from '@/lib/geo'
import { FreshnessBadge } from '@/components/shared/status'
import type { Freshness, RouteOption } from '@/types'

function etaLabel(seconds: number): string {
  const min = Math.max(1, Math.round(seconds / 60))
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`
}

export function RoutePanel({
  destination,
  routes,
  activeIndex,
  onSelect,
  onClear,
  fetching,
  freshness,
  note,
  attribution,
}: {
  destination: { lat: number; lng: number; label?: string }
  routes: RouteOption[]
  activeIndex: number
  onSelect: (index: number) => void
  onClear: () => void
  fetching: boolean
  freshness: Freshness
  note?: string
  attribution: string
}) {
  const unavailable = !fetching && routes.length === 0 && freshness === 'unavailable'

  return (
    <div className="pointer-events-auto w-full max-w-xs overflow-hidden rounded-lg border border-border bg-panel/95 backdrop-blur-sm md:w-80">
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
        <p className="flex min-w-0 items-center gap-2 label-micro">
          <Navigation className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
          <span className="truncate">
            Route · {destination.label ? destination.label : 'selected point'}
          </span>
        </p>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear route"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted transition-soft hover:bg-hover hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="max-h-56 overflow-y-auto scroll-slim p-3">
        {fetching && routes.length === 0 && (
          <p className="flex items-center gap-2 px-1 py-2 text-xs text-text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Planning fastest routes…
          </p>
        )}

        {unavailable && (
          <div className="space-y-2">
            <p className="flex items-start gap-2 rounded-md border border-status-warning/30 bg-status-warning/10 px-2.5 py-2 text-xs leading-relaxed text-status-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Routing unavailable right now — no invented routes.
              {note ? ` ${note}` : ''}
            </p>
          </div>
        )}

        {routes.length > 0 && (
          <ul className="space-y-1.5">
            {routes.map((r, idx) => {
              const active = idx === Math.min(activeIndex, routes.length - 1)
              return (
                <li key={idx}>
                  <button
                    type="button"
                    onClick={() => onSelect(idx)}
                    aria-pressed={active}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-soft',
                      active
                        ? 'border-foreground/60 bg-hover'
                        : 'border-border bg-panel-2 hover:bg-hover',
                    )}
                  >
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                        idx === 0
                          ? 'bg-foreground text-background'
                          : 'bg-panel-2 text-text-secondary',
                      )}
                    >
                      {idx === 0 ? 'Fastest' : `Alt ${idx}`}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium tabular-nums text-foreground">
                        {etaLabel(r.durationSeconds)}
                        <span className="mx-1.5 text-text-muted">·</span>
                        {formatDistance(r.distanceMeters)}
                      </span>
                      <span className="block text-[10px] text-text-muted">
                        {idx === 0 ? 'Quickest by time from your position' : 'Alternative — usually a bit longer'}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-2 flex items-center justify-between gap-2 px-1">
          <p className="text-[10px] leading-relaxed text-text-muted">{attribution}</p>
          {routes.length > 0 && <FreshnessBadge freshness={freshness} />}
        </div>
      </div>
    </div>
  )
}
