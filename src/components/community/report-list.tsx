'use client'

// NIGHTRIDE — community report list + filters.

import Link from 'next/link'
import { CheckCircle2, MessageSquare, ShieldCheck } from 'lucide-react'
import { formatDistance } from '@/lib/geo'
import { REPORT_CATEGORIES, REPORT_CATEGORY_META } from '@/lib/categories'
import { cn } from '@/lib/utils'
import { CategoryBadge } from '@/components/shared/panels'
import { RelativeTime } from '@/components/shared/status'
import type { CommunityReport, ReportCategory } from '@/types'

export function ReportFilters({
  activeCategories,
  onToggleCategory,
  status,
  onStatusChange,
  sort,
  onSortChange,
  canSortNearby,
}: {
  activeCategories: ReportCategory[]
  onToggleCategory: (c: ReportCategory) => void
  status: 'all' | 'open' | 'resolved'
  onStatusChange: (s: 'all' | 'open' | 'resolved') => void
  sort: 'recent' | 'nearby'
  onSortChange: (s: 'recent' | 'nearby') => void
  canSortNearby: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {REPORT_CATEGORIES.map((c) => {
          const active = activeCategories.includes(c)
          return (
            <button
              key={c}
              type="button"
              onClick={() => onToggleCategory(c)}
              aria-pressed={active}
              className={cn(
                'rounded-md border px-2 py-1 text-[10px] font-medium uppercase tracking-wider transition-soft',
                active
                  ? 'border-foreground/60 bg-hover text-foreground'
                  : 'border-border bg-panel text-text-muted hover:text-text-secondary',
              )}
              title={REPORT_CATEGORY_META[c].description}
            >
              {REPORT_CATEGORY_META[c].short}
            </button>
          )
        })}
        {activeCategories.length > 0 && (
          <button
            type="button"
            onClick={() => activeCategories.forEach(onToggleCategory)}
            className="ml-1 text-[10px] font-medium uppercase tracking-wider text-text-muted underline-offset-2 transition-soft hover:text-foreground hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-md border border-border bg-panel p-0.5">
          {(['all', 'open', 'resolved'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onStatusChange(s)}
              aria-pressed={status === s}
              className={cn(
                'rounded px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider transition-soft',
                status === s ? 'bg-hover text-foreground' : 'text-text-muted hover:text-text-secondary',
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border bg-panel p-0.5">
          {(['recent', 'nearby'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSortChange(s)}
              disabled={s === 'nearby' && !canSortNearby}
              title={
                s === 'nearby' && !canSortNearby
                  ? 'Grant location permission to sort by distance'
                  : undefined
              }
              aria-pressed={sort === s}
              className={cn(
                'rounded px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider transition-soft disabled:opacity-40',
                sort === s ? 'bg-hover text-foreground' : 'text-text-muted hover:text-text-secondary',
              )}
            >
              {s === 'recent' ? 'Newest' : 'Nearest'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ReportCard({
  report,
  onOpen,
}: {
  report: CommunityReport
  onOpen: (report: CommunityReport) => void
}) {
  return (
    <article className="rounded-lg border border-border bg-panel transition-soft hover:border-text-muted/40">
      <button
        type="button"
        onClick={() => onOpen(report)}
        className="w-full p-4 text-left"
        aria-label={`Open report: ${report.title}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <CategoryBadge category={report.category} />
            {report.verificationStatus === 'confirmed' && (
              <span className="inline-flex items-center gap-1 rounded-md border border-status-success/30 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-status-success">
                <ShieldCheck className="h-3 w-3" aria-hidden /> Verified
              </span>
            )}
            {report.status !== 'open' && (
              <span className="rounded-md border border-border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-text-muted">
                {report.status}
              </span>
            )}
          </div>
          <RelativeTime iso={report.createdAt} className="shrink-0" />
        </div>

        <h3 className="mt-2.5 text-sm font-semibold leading-snug text-foreground">{report.title}</h3>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-secondary">
          {report.description}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-muted">
          <span>By {report.author?.username ?? 'unknown'}</span>
          {report.locationLabel && <span className="truncate">📍 {report.locationLabel}</span>}
          {report.distanceMeters !== undefined && (
            <span className="tabular-nums">{formatDistance(report.distanceMeters)} away</span>
          )}
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3 w-3" aria-hidden /> {report.commentCount}
          </span>
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" aria-hidden /> {report.confirmationCount}
          </span>
        </div>
      </button>
    </article>
  )
}

export function ReportListItemLink({ report }: { report: CommunityReport }) {
  return (
    <Link href={`/community?report=${report.id}`} className="text-xs text-text-secondary underline-offset-2 hover:underline">
      {report.title}
    </Link>
  )
}
