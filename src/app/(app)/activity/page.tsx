'use client'

// NIGHTRIDE — activity feed: chronological stream of community reports,
// road condition updates, road closures, official public safety
// announcements and aviation activity summaries — each with source +
// timestamp. Refreshes live via realtime pushes.

import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity as ActivityIcon,
  Ban,
  ExternalLink,
  Plane,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react'
import { fetchActivity } from '@/services/publicSafety/apiStatusService'
import { useRealtime } from '@/hooks/use-realtime'
import { CategoryBadge, EmptyState, LoadingRows, Panel, SectionHeader } from '@/components/shared/panels'
import { RelativeTime } from '@/components/shared/status'
import { cn } from '@/lib/utils'
import type { ActivityItem, ActivityKind } from '@/types'

const KIND_META: Record<ActivityKind, { icon: typeof TriangleAlert; label: string; cls: string }> = {
  community_report: { icon: ActivityIcon, label: 'Community report', cls: 'text-text-secondary' },
  road_condition: { icon: TriangleAlert, label: 'Road condition', cls: 'text-status-warning' },
  road_closure: { icon: Ban, label: 'Road closure', cls: 'text-status-danger' },
  public_safety: { icon: ShieldAlert, label: 'Official safety announcement', cls: 'text-status-warning' },
  aviation_summary: { icon: Plane, label: 'Aviation activity', cls: 'text-text-secondary' },
}

const FILTERS: { key: 'all' | ActivityKind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'community_report', label: 'Reports' },
  { key: 'road_condition', label: 'Road conditions' },
  { key: 'road_closure', label: 'Closures' },
  { key: 'public_safety', label: 'Safety' },
  { key: 'aviation_summary', label: 'Aviation' },
]

export default function ActivityPage() {
  const queryClient = useQueryClient()

  const activityQuery = useQuery({
    queryKey: ['activity'],
    queryFn: () => fetchActivity(80),
    staleTime: 30_000,
    refetchInterval: 120_000,
  })

  useRealtime({
    onReportNew: () => void queryClient.invalidateQueries({ queryKey: ['activity'] }),
    onReportUpdated: () => void queryClient.invalidateQueries({ queryKey: ['activity'] }),
    onSafetyNew: () => void queryClient.invalidateQueries({ queryKey: ['activity'] }),
  })

  const items = useMemo(() => activityQuery.data?.items ?? [], [activityQuery.data])

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 lg:p-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Activity</h1>
        <p className="mt-0.5 text-xs text-text-secondary">
          Everything happening around your riding area — community reports, road updates and official
          public safety information, each with its real source and timestamp.
        </p>
      </div>

      <Panel>
        <SectionHeader
          label="Feed"
          icon={ActivityIcon}
          action={
            <span className="text-[10px] uppercase tracking-wider text-text-muted">
              {items.length} items
            </span>
          }
        />
        {activityQuery.isLoading ? (
          <LoadingRows rows={6} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ActivityIcon}
            title="Nothing in the feed yet"
            description="Community reports, official alerts and road updates will appear here as they happen."
          />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </Panel>

      <p className="pb-2 text-center text-[10px] leading-relaxed text-text-muted">
        External information is aggregated from official public sources (National Weather Service,
        OpenSky Network) and the rider community. No individual law-enforcement movements are tracked
        or shown.
      </p>
    </div>
  )
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const meta = KIND_META[item.kind]
  const Icon = meta.icon
  const href = item.reportId
    ? `/community?report=${item.reportId}`
    : item.latitude !== undefined && item.longitude !== undefined
      ? `/map?lat=${item.latitude}&lng=${item.longitude}&zoom=13`
      : item.sourceUrl
  return (
    <li>
      <div className="flex gap-3 px-4 py-3.5">
        <span
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-panel-2',
            meta.cls,
          )}
          aria-hidden
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold leading-snug text-foreground">{item.title}</p>
            <RelativeTime iso={item.timestamp} className="shrink-0" />
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-text-secondary">
            {item.description}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
              {meta.label}
            </span>
            <span className="text-[10px] text-text-muted">·</span>
            <span className="text-[10px] text-text-secondary">{item.sourceName}</span>
            {item.severity && (
              <span className="rounded border border-border px-1 py-0.5 text-[9px] uppercase tracking-wider text-text-muted">
                {item.severity}
              </span>
            )}
            {item.category && item.kind === 'community_report' && (
              <CategoryBadge category={item.category as 'road_hazard'} compact />
            )}
            {href && (
              <a
                href={href}
                target={item.sourceUrl && !item.reportId && item.latitude === undefined ? '_blank' : undefined}
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-[10px] text-text-secondary underline-offset-2 transition-soft hover:text-foreground hover:underline"
              >
                {item.sourceUrl && !item.reportId && item.latitude === undefined ? (
                  <>
                    Source <ExternalLink className="h-3 w-3" aria-hidden />
                  </>
                ) : (
                  'View'
                )}
              </a>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}
