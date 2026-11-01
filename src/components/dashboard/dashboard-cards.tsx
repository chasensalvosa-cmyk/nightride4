'use client'

// NIGHTRIDE — dashboard cards: rider status, quick map, recent ride,
// nearby reports, road condition alerts, public safety announcements,
// saved locations. Compact and honest — no filler charts.

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  Bookmark,
  Gauge,
  MapPin,
  Map as MapIcon,
  MessagesSquare,
  OctagonX,
  Route,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react'
import { formatDistance, formatDuration, formatSpeed } from '@/lib/geo'
import { REPORT_CATEGORY_META } from '@/lib/categories'
import { cn } from '@/lib/utils'
import { CategoryBadge, EmptyState, LoadingRows, Panel, SectionHeader } from '@/components/shared/panels'
import { FreshnessBadge, RelativeTime, StatusDot } from '@/components/shared/status'
import { Button } from '@/components/ui/button'
import type {
  CommunityReport,
  PublicSafetyEvent,
  Ride,
  SavedLocation,
} from '@/types'

const ROAD_CONDITION_CATEGORIES = ['road_hazard', 'damaged_road', 'construction', 'road_closure']

// ---------------------------------------------------------------- header

export function WelcomeHeader({ username }: { username: string | null }) {
  const hour = new Date().getHours()
  const greeting =
    hour < 5 ? 'Night ride energy' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          {username ? `${greeting}, ${username}` : greeting}
        </h1>
        <p className="mt-0.5 text-xs text-text-secondary">
          {dateLabel} · Road intelligence for your next e-moto ride
        </p>
      </div>
      <Button asChild size="sm" className="gap-1.5">
        <Link href="/map">
          Open live map <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------- rider status

export function RiderStatusCard({
  signedIn,
  gps,
  activeRide,
  realtime,
  dataProvidersOk,
  referenceLabel,
}: {
  signedIn: boolean
  gps: 'unknown' | 'granted' | 'denied' | 'unavailable'
  activeRide: Ride | null
  realtime: boolean
  dataProvidersOk: boolean | null
  referenceLabel: string
}) {
  const rows: { label: string; value: React.ReactNode; ok: boolean | null }[] = [
    {
      label: 'Account',
      value: signedIn ? 'Signed in' : 'Browsing (no account)',
      ok: signedIn,
    },
    {
      label: 'GPS',
      value:
        gps === 'granted'
          ? 'Permission granted'
          : gps === 'denied'
            ? 'Permission denied'
            : gps === 'unavailable'
              ? 'Unavailable here'
              : 'Not requested',
      ok: gps === 'granted',
    },
    {
      label: 'Ride',
      value: activeRide ? (activeRide.status === 'paused' ? 'Paused' : 'Recording') : 'No active ride',
      ok: !!activeRide,
    },
    {
      label: 'Live updates',
      value: realtime ? 'Connected' : 'Offline',
      ok: realtime,
    },
    {
      label: 'Data providers',
      value: dataProvidersOk === null ? 'Checking…' : dataProvidersOk ? 'Operational' : 'Limited',
      ok: dataProvidersOk,
    },
  ]
  return (
    <Panel className="flex h-full flex-col">
      <SectionHeader label="Rider status" icon={Gauge} />
      <ul className="flex-1 space-y-1 px-4 pb-4">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-2 py-1">
            <span className="text-xs text-text-secondary">{r.label}</span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <StatusDot
                status={
                  r.ok === null
                    ? 'missing'
                    : r.ok
                      ? 'connected'
                      : r.label === 'GPS' && gps === 'unknown'
                        ? 'missing'
                        : 'error'
                }
              />
              {r.value}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-border px-4 py-2.5 text-[10px] leading-relaxed text-text-muted">
        Nearby content uses your last map position ({referenceLabel}).
      </p>
    </Panel>
  )
}

// ---------------------------------------------------------------- quick map

export function QuickMapCard() {
  return (
    <Panel className="group relative h-full overflow-hidden">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(#292929 1px, transparent 1px), linear-gradient(90deg, #292929 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
        aria-hidden
      />
      <div className="relative flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-panel-2">
          <MapIcon className="h-6 w-6 text-foreground" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Live Map</p>
          <p className="mt-1 max-w-[16rem] text-xs leading-relaxed text-text-secondary">
            Road hazards, closures, charging stations, air traffic and rider reports — one dark map.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/map">
            Open map <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
          </Link>
        </Button>
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------- recent ride

export function RecentRideCard({ ride, loading, signedIn }: { ride: Ride | null; loading: boolean; signedIn: boolean }) {
  return (
    <Panel className="flex h-full flex-col">
      <SectionHeader
        label="Recent ride"
        icon={Route}
        action={
          <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[10px] uppercase tracking-wider text-text-muted">
            <Link href="/rides">All rides</Link>
          </Button>
        }
      />
      {loading ? (
        <LoadingRows rows={2} />
      ) : !signedIn ? (
        <EmptyState
          icon={Route}
          title="Sign in to track rides"
          description="GPS ride tracking with distance, duration and speed statistics."
          actionLabel="Create account"
          actionHref="/auth/register"
        />
      ) : ride ? (
        <div className="flex-1 px-4 pb-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Distance" value={formatDistance(ride.distanceMeters)} />
            <Stat label="Duration" value={formatDuration(ride.durationSeconds)} />
            <Stat label="Avg speed" value={formatSpeed(ride.averageSpeed)} />
            <Stat label="Max speed" value={formatSpeed(ride.maximumSpeed)} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <RelativeTime iso={ride.startedAt} />
            <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[10px] uppercase tracking-wider text-text-muted">
              <Link href="/rides">Details</Link>
            </Button>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={Route}
          title="No rides yet"
          description="Start your first GPS-tracked ride — permission required, never simulated."
          actionLabel="Start a ride"
          actionHref="/rides"
        />
      )}
    </Panel>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-panel-2 px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

// ---------------------------------------------------------------- nearby reports

export function NearbyReportsCard({
  reports,
  loading,
  hasReference,
}: {
  reports: CommunityReport[]
  loading: boolean
  hasReference: boolean
}) {
  return (
    <Panel className="flex h-full flex-col">
      <SectionHeader
        label={hasReference ? 'Nearby community reports' : 'Recent community reports'}
        icon={MessagesSquare}
        action={
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-[10px] uppercase tracking-wider text-text-muted">
            <Link href="/community">Community</Link>
          </Button>
        }
      />
      {loading ? (
        <LoadingRows rows={3} />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="No reports yet"
          description="When riders report hazards and riding spots, they appear here."
          actionLabel="Report something"
          actionHref="/community"
        />
      ) : (
        <ul className="max-h-72 flex-1 divide-y divide-border overflow-y-auto scroll-slim">
          {reports.slice(0, 6).map((r) => (
            <li key={r.id}>
              <Link
                href={`/community?report=${r.id}`}
                className="flex items-start gap-3 px-4 py-3 transition-soft hover:bg-hover"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{r.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <CategoryBadge category={r.category} compact />
                    {r.distanceMeters !== undefined && (
                      <span className="text-[10px] text-text-muted">{formatDistance(r.distanceMeters)}</span>
                    )}
                  </div>
                </div>
                <RelativeTime iso={r.createdAt} className="shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- road condition alerts

export function RoadConditionAlertsCard({
  reports,
  loading,
}: {
  reports: CommunityReport[]
  loading: boolean
}) {
  const open = reports.filter((r) => r.status === 'open')
  return (
    <Panel className="flex h-full flex-col">
      <SectionHeader label="Road condition alerts" icon={TriangleAlert} />
      {loading ? (
        <LoadingRows rows={3} />
      ) : open.length === 0 ? (
        <EmptyState
          icon={TriangleAlert}
          title="No open road alerts"
          description="Hazards, damaged roads, construction and closures reported by riders will surface here."
        />
      ) : (
        <ul className="max-h-72 flex-1 divide-y divide-border overflow-y-auto scroll-slim">
          {open.slice(0, 6).map((r) => (
            <li key={r.id}>
              <Link
                href={`/community?report=${r.id}`}
                className="flex items-start gap-3 px-4 py-3 transition-soft hover:bg-hover"
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
                    r.category === 'road_closure'
                      ? 'border-status-danger/40 bg-status-danger/10 text-status-danger'
                      : 'border-status-warning/40 bg-status-warning/10 text-status-warning',
                  )}
                >
                  {r.category === 'road_closure' ? (
                    <OctagonX className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{r.title}</p>
                  <p className="mt-0.5 truncate text-[10px] text-text-muted">
                    {REPORT_CATEGORY_META[r.category].label}
                    {r.locationLabel ? ` · ${r.locationLabel}` : ''}
                  </p>
                </div>
                <RelativeTime iso={r.createdAt} className="shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- public safety

export function SafetyAnnouncementsCard({
  events,
  loading,
  freshness,
  fetchedAt,
  note,
}: {
  events: PublicSafetyEvent[]
  loading: boolean
  freshness: string
  fetchedAt: string | null
  note?: string
}) {
  return (
    <Panel className="flex h-full flex-col">
      <SectionHeader
        label="Public safety announcements"
        icon={ShieldAlert}
        action={<FreshnessBadge freshness={freshness as 'live'} />}
      />
      {loading ? (
        <LoadingRows rows={3} />
      ) : events.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title={note ? 'Safety feed unavailable' : 'No active announcements'}
          description={
            note ??
              'Official alerts from the National Weather Service (public domain) appear here with full attribution.'
          }
        />
      ) : (
        <ul className="max-h-72 flex-1 divide-y divide-border overflow-y-auto scroll-slim">
          {events.slice(0, 6).map((e) => (
            <li key={e.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium leading-snug text-foreground">{e.title}</p>
                {e.severity && (
                  <span
                    className={cn(
                      'shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider',
                      e.severity === 'Extreme' || e.severity === 'Severe'
                        ? 'border-status-danger/40 text-status-danger'
                        : 'border-border text-text-muted',
                    )}
                  >
                    {e.severity}
                  </span>
                )}
              </div>
              {e.areaDesc && <p className="mt-0.5 truncate text-[10px] text-text-muted">{e.areaDesc}</p>}
              <p className="mt-1.5 flex items-center gap-2 text-[10px] text-text-muted">
                {e.sourceName} (official) · <RelativeTime iso={e.occurredAt} />
              </p>
            </li>
          ))}
        </ul>
      )}
      {fetchedAt && (
        <p className="border-t border-border px-4 py-2 text-[10px] text-text-muted">
          Source: National Weather Service · updated {new Date(fetchedAt).toLocaleTimeString()}
        </p>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- saved locations

export function SavedLocationsCard({
  locations,
  loading,
  signedIn,
}: {
  locations: SavedLocation[]
  loading: boolean
  signedIn: boolean
}) {
  return (
    <Panel className="flex h-full flex-col">
      <SectionHeader
        label="Saved locations"
        icon={Bookmark}
        action={
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-[10px] uppercase tracking-wider text-text-muted">
            <Link href="/saved">Manage</Link>
          </Button>
        }
      />
      {loading ? (
        <LoadingRows rows={2} />
      ) : !signedIn ? (
        <EmptyState
          icon={Bookmark}
          title="Sign in to save locations"
          description="Charging spots, viewpoints and meeting points — private to your account."
          actionLabel="Create account"
          actionHref="/auth/register"
        />
      ) : locations.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="Nothing saved yet"
          description="Save charging stations, viewpoints and meeting points from the map."
          actionLabel="Open map"
          actionHref="/map"
        />
      ) : (
        <ul className="flex divide-x divide-border overflow-x-auto scroll-slim">
          {locations.slice(0, 6).map((l) => (
            <li key={l.id} className="min-w-[10rem] flex-1">
              <Link
                href={`/map?lat=${l.latitude}&lng=${l.longitude}&zoom=14`}
                className="flex h-full flex-col gap-1 px-4 py-3 transition-soft hover:bg-hover"
              >
                <MapPin className="h-3.5 w-3.5 text-text-muted" aria-hidden />
                <p className="truncate text-xs font-medium text-foreground">{l.name}</p>
                <p className="truncate text-[10px] text-text-muted">
                  {l.latitude.toFixed(4)}, {l.longitude.toFixed(4)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export type { LucideIcon }
