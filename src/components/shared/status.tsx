'use client'

// NIGHTRIDE — shared small UI primitives.

import { cn } from '@/lib/utils'
import type { Freshness, ProviderStatus } from '@/types'

export function StatusDot({
  status,
  className,
}: {
  status: ProviderStatus | Freshness | 'connected' | 'live' | 'ok'
  className?: string
}) {
  const color =
    status === 'connected' || status === 'live' || status === 'ok'
      ? 'bg-status-success'
      : status === 'delayed'
        ? 'bg-status-warning'
        : status === 'stale'
          ? 'bg-status-warning'
          : status === 'rate_limited'
            ? 'bg-status-warning'
            : status === 'missing'
              ? 'bg-text-muted'
              : 'bg-status-danger'
  return (
    <span
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', color, className)}
      aria-hidden
    />
  )
}

const FRESHNESS_LABEL: Record<Freshness, { text: string; cls: string }> = {
  live: { text: 'Live', cls: 'text-status-success border-status-success/30' },
  delayed: { text: 'Delayed', cls: 'text-status-warning border-status-warning/30' },
  stale: { text: 'Stale', cls: 'text-status-warning border-status-warning/30' },
  unavailable: { text: 'Unavailable', cls: 'text-status-danger border-status-danger/30' },
}

export function FreshnessBadge({
  freshness,
  source,
  fetchedAt,
  className,
}: {
  freshness: Freshness
  source?: string
  fetchedAt?: string | null
  className?: string
}) {
  const meta = FRESHNESS_LABEL[freshness]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider',
        meta.cls,
        className,
      )}
      title={
        source
          ? `${source}${fetchedAt ? ` · updated ${new Date(fetchedAt).toLocaleTimeString()}` : ''}`
          : undefined
      }
    >
      {meta.text}
    </span>
  )
}

export function DataSourceNote({
  source,
  attribution,
  fetchedAt,
  className,
}: {
  source: string
  attribution?: string
  fetchedAt?: string | null
  className?: string
}) {
  return (
    <p className={cn('text-[11px] leading-relaxed text-text-muted', className)}>
      Source: {source}
      {fetchedAt ? ` · updated ${new Date(fetchedAt).toLocaleTimeString()}` : ''}
      {attribution ? ` · ${attribution}` : ''}
    </p>
  )
}

export function RelativeTime({
  iso,
  className,
}: {
  iso: string
  className?: string
}) {
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  const label = formatRelative(diff)
  return (
    <time dateTime={iso} className={cn('text-xs text-text-muted', className)} title={date.toLocaleString()}>
      {label}
    </time>
  )
}

function formatRelative(diffMs: number): string {
  const s = Math.floor(diffMs / 1000)
  if (s < 45) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} d ago`
  return `${Math.floor(d / 7)} w ago`
}
