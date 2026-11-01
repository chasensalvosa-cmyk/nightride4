'use client'

// NIGHTRIDE — ride tracker card: live GPS stats with honest states
// (permission denied / unavailable / poor accuracy / sync offline /
// interrupted session recovery).

import { AlertTriangle, Loader2, Pause, Play, Square, Trash2, Waypoints } from 'lucide-react'
import { formatDistance, formatDuration, formatSpeed } from '@/lib/geo'
import { cn } from '@/lib/utils'
import { Panel, SectionHeader } from '@/components/shared/panels'
import { StatusDot } from '@/components/shared/status'
import { Button } from '@/components/ui/button'
import type { TrackerSnapshot } from '@/hooks/use-ride-tracker'
import type { GeoPermission } from '@/hooks/use-geolocation'

export function RideTrackerCard({
  snapshot,
  geoPermission,
  geoError,
  onStart,
  onPause,
  onResume,
  onEnd,
  onDiscard,
  busy,
  points,
}: {
  snapshot: TrackerSnapshot
  geoPermission: GeoPermission
  geoError: string | null
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onEnd: () => void
  onDiscard: () => void
  busy: boolean
  points: { lat: number; lng: number }[]
}) {
  const tracking = snapshot.status === 'tracking'
  const paused = snapshot.status === 'paused'
  const recovered = snapshot.status === 'recovered'
  const idle = snapshot.status === 'idle' || snapshot.status === 'starting'
  const live = tracking || paused || recovered

  return (
    <Panel className="overflow-hidden">
      <SectionHeader
        label={live ? (tracking ? 'Recording ride' : paused ? 'Ride paused' : 'Ride interrupted') : 'Ride tracker'}
        icon={Waypoints}
        action={
          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
            <StatusDot
              status={
                tracking
                  ? snapshot.offline
                    ? 'stale'
                    : 'connected'
                  : paused
                    ? 'delayed'
                    : 'missing'
              }
            />
            {tracking ? (snapshot.offline ? 'Recording · sync pending' : 'Recording') : paused ? 'Paused' : recovered ? 'Interrupted' : 'Idle'}
          </span>
        }
      />

      {/* GPS permission / quality states — explicit, never silent */}
      {geoPermission === 'denied' && (
        <StateNote tone="danger">
          Location permission denied. NIGHTRIDE never simulates rides — enable location access in
          your browser to track. {geoError}
        </StateNote>
      )}
      {geoPermission === 'unavailable' && (
        <StateNote tone="danger">
          Geolocation is unavailable in this browser context. Ride tracking requires real GPS fixes.
        </StateNote>
      )}
      {live && snapshot.poorAccuracy && (
        <StateNote tone="warning">
          Poor GPS accuracy right now — fixes above 75 m are ignored to keep your distance honest.
        </StateNote>
      )}
      {live && snapshot.offline && (
        <StateNote tone="warning">{snapshot.error}</StateNote>
      )}
      {recovered && (
        <StateNote tone="warning">
          Unfinished ride found (started{' '}
          {snapshot.startedAt ? new Date(snapshot.startedAt).toLocaleString() : 'earlier'}). The gap
          while the page was closed was not recorded. Resume to continue tracking, or discard.
        </StateNote>
      )}

      {/* stats */}
      <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-5">
        <StatBox label="Distance" value={formatDistance(snapshot.distanceMeters)} big />
        <StatBox label="Duration" value={formatDuration(snapshot.durationSeconds)} big />
        <StatBox label="Current" value={formatSpeed(snapshot.currentSpeed)} />
        <StatBox label="Average" value={formatSpeed(snapshot.averageSpeed)} />
        <StatBox label="Maximum" value={formatSpeed(snapshot.maximumSpeed)} />
      </div>

      {/* live route preview (real recorded points) */}
      {live && (
        <div className="px-4">
          <RoutePreview points={points} />
        </div>
      )}

      {/* controls */}
      <div className="flex flex-wrap gap-2 border-t border-border p-4">
        {idle && (
          <Button onClick={onStart} disabled={busy || snapshot.status === 'starting'} className="gap-1.5">
            {snapshot.status === 'starting' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Play className="h-3.5 w-3.5" aria-hidden />
            )}
            Start ride
          </Button>
        )}
        {tracking && (
          <>
            <Button onClick={onPause} variant="secondary" className="gap-1.5">
              <Pause className="h-3.5 w-3.5" aria-hidden /> Pause
            </Button>
            <Button onClick={onEnd} className="gap-1.5">
              <Square className="h-3.5 w-3.5" aria-hidden /> End ride
            </Button>
          </>
        )}
        {paused && (
          <>
            <Button onClick={onResume} className="gap-1.5">
              <Play className="h-3.5 w-3.5" aria-hidden /> Resume
            </Button>
            <Button onClick={onEnd} variant="secondary" className="gap-1.5">
              <Square className="h-3.5 w-3.5" aria-hidden /> End ride
            </Button>
          </>
        )}
        {recovered && (
          <>
            <Button onClick={onResume} className="gap-1.5">
              <Play className="h-3.5 w-3.5" aria-hidden /> Resume tracking
            </Button>
            <Button onClick={onEnd} variant="secondary" className="gap-1.5">
              <Square className="h-3.5 w-3.5" aria-hidden /> Save & end
            </Button>
            <Button onClick={onDiscard} variant="ghost" className="gap-1.5 text-status-danger hover:text-status-danger">
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Discard
            </Button>
          </>
        )}
        {live && (
          <span className="ml-auto self-center text-[10px] text-text-muted">
            {snapshot.pointCount} GPS points recorded
            {snapshot.lastSyncAt ? ` · last sync ${new Date(snapshot.lastSyncAt).toLocaleTimeString()}` : ''}
          </span>
        )}
      </div>
    </Panel>
  )
}

function StateNote({ tone, children }: { tone: 'warning' | 'danger'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'mx-4 mt-1 flex items-start gap-2 rounded-md border px-3 py-2 text-[11px] leading-relaxed',
        tone === 'danger'
          ? 'border-status-danger/40 bg-status-danger/10 text-status-danger'
          : 'border-status-warning/40 bg-status-warning/10 text-status-warning',
      )}
      role="status"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  )
}

function StatBox({
  label,
  value,
  big = false,
}: {
  label: string
  value: string
  big?: boolean
}) {
  return (
    <div className="rounded-md border border-border bg-panel-2 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p
        className={cn(
          'mt-0.5 font-semibold tabular-nums text-foreground',
          big ? 'text-lg' : 'text-sm',
        )}
      >
        {value}
      </p>
    </div>
  )
}

/** Lightweight honest route preview from real recorded points (no map tiles). */
function RoutePreview({ points }: { points: { lat: number; lng: number }[] }) {
  if (points.length < 2) {
    return (
      <div className="mb-4 flex h-28 items-center justify-center rounded-md border border-border bg-panel-2">
        <p className="text-[11px] text-text-muted">Waiting for GPS points… route preview appears here.</p>
      </div>
    )
  }
  const lats = points.map((p) => p.lat)
  const lngs = points.map((p) => p.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const w = 600
  const h = 112
  const pad = 8
  const dx = Math.max(maxLng - minLng, 1e-6)
  const dy = Math.max(maxLat - minLat, 1e-6)
  const scale = Math.min((w - pad * 2) / dx, (h - pad * 2) / dy)
  const px = (p: { lat: number; lng: number }) =>
    `${pad + (p.lng - minLng) * scale},${h - pad - (p.lat - minLat) * scale}`
  const path = points.map(px).join(' ')

  return (
    <div className="mb-4 overflow-hidden rounded-md border border-border bg-panel-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-28 w-full" role="img" aria-label="Live route preview">
        <polyline
          points={path}
          fill="none"
          stroke="#929292"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle {...circleAt(points[0], { minLat, minLng, scale, h, pad })} r="3.5" fill="#F5F5F5" />
        <circle
          {...circleAt(points[points.length - 1], { minLat, minLng, scale, h, pad })}
          r="3.5"
          fill="#4CAF7D"
        />
      </svg>
    </div>
  )
}

function circleAt(
  p: { lat: number; lng: number },
  m: { minLat: number; minLng: number; scale: number; h: number; pad: number },
) {
  return {
    cx: m.pad + (p.lng - m.minLng) * m.scale,
    cy: m.h - m.pad - (p.lat - m.minLat) * m.scale,
  }
}
