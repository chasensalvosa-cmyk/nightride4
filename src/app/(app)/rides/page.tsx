'use client'

// NIGHTRIDE — rides page: GPS tracker + history.

import { useQuery } from '@tanstack/react-query'
import { Route } from 'lucide-react'
import { RideTrackerCard } from '@/components/rides/ride-tracker-card'
import { RideHistory } from '@/components/rides/ride-history'
import { AuthGate, Panel, SectionHeader } from '@/components/shared/panels'
import { fetchRides } from '@/services/rides/rideService'
import { useAuth } from '@/hooks/use-auth'
import { useRideTracker } from '@/hooks/use-ride-tracker'
import { formatDistance, formatDuration } from '@/lib/geo'

export default function RidesPage() {
  const { user, loading: authLoading } = useAuth()
  const signedIn = !!user && !authLoading
  const tracker = useRideTracker(signedIn)

  const ridesQuery = useQuery({
    queryKey: ['rides', 'history'],
    queryFn: () => fetchRides('completed'),
    enabled: signedIn,
    staleTime: 15_000,
  })

  const completed = ridesQuery.data?.rides ?? []

  // Aggregate lifetime stats (real ride data only).
  const totals = completed.reduce(
    (acc, r) => ({
      rides: acc.rides + 1,
      distance: acc.distance + r.distanceMeters,
      duration: acc.duration + r.durationSeconds,
    }),
    { rides: 0, distance: 0, duration: 0 },
  )

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 lg:p-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Rides</h1>
        <p className="mt-0.5 text-xs text-text-secondary">
          GPS ride tracking — real fixes only. Your rides are private to your account.
        </p>
      </div>

      {!signedIn ? (
        <Panel>
          <SectionHeader label="Ride tracker" icon={Route} />
          <AuthGate feature="track rides" />
        </Panel>
      ) : (
        <>
          <RideTrackerCard
            snapshot={tracker.snapshot}
            geoPermission={tracker.geo.permission}
            geoError={tracker.geo.error}
            onStart={() => void tracker.start()}
            onPause={() => void tracker.pause()}
            onResume={() => void tracker.resume()}
            onEnd={() => void tracker.end()}
            onDiscard={() => void tracker.discard()}
            busy={false}
            points={tracker.getPoints()}
          />

          {completed.length > 0 && (
            <Panel className="p-4">
              <div className="grid grid-cols-3 gap-2">
                <SummaryStat label="Total rides" value={String(totals.rides)} />
                <SummaryStat label="Total distance" value={formatDistance(totals.distance)} />
                <SummaryStat label="Total time" value={formatDuration(totals.duration)} />
              </div>
            </Panel>
          )}

          {ridesQuery.isLoading ? (
            <Panel className="p-6 text-center text-xs text-text-muted">Loading history…</Panel>
          ) : (
            <RideHistory rides={completed} />
          )}
        </>
      )}
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-panel-2 px-3 py-2.5 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}
