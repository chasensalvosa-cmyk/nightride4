'use client'

// NIGHTRIDE — ride history list + detail dialog with route preview.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Route, Trash2 } from 'lucide-react'
import { deleteRide } from '@/services/rides/rideService'
import { formatDistance, formatDuration, formatSpeed } from '@/lib/geo'
import { Panel, SectionHeader, EmptyState } from '@/components/shared/panels'
import { RelativeTime } from '@/components/shared/status'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useState } from 'react'
import type { Ride } from '@/types'

export function RideHistory({ rides }: { rides: Ride[] }) {
  const [detail, setDetail] = useState<Ride | null>(null)
  if (rides.length === 0) {
    return (
      <Panel>
        <SectionHeader label="Ride history" icon={Route} />
        <EmptyState
          icon={Route}
          title="No completed rides"
          description="End a tracked ride and it lands here with distance, duration and speed stats."
        />
      </Panel>
    )
  }
  return (
    <Panel>
      <SectionHeader label={`Ride history (${rides.length})`} icon={Route} />
      <ul className="divide-y divide-border">
        {rides.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setDetail(r)}
              className="flex w-full items-center gap-4 px-4 py-3 text-left transition-soft hover:bg-hover"
              aria-label={`Open ride from ${new Date(r.startedAt).toLocaleString()}`}
            >
              <div className="hidden w-24 shrink-0 sm:block">
                <p className="text-xs font-medium text-foreground">
                  {new Date(r.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </p>
                <RelativeTime iso={r.startedAt} />
              </div>
              <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
                <HistoryStat label="Distance" value={formatDistance(r.distanceMeters)} />
                <HistoryStat label="Duration" value={formatDuration(r.durationSeconds)} />
                <HistoryStat label="Avg" value={formatSpeed(r.averageSpeed)} />
                <HistoryStat label="Max" value={formatSpeed(r.maximumSpeed)} />
              </div>
            </button>
          </li>
        ))}
      </ul>
      <RideDetailDialog ride={detail} onOpenChange={(o) => !o && setDetail(null)} />
    </Panel>
  )
}

function HistoryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className="text-xs font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function RideDetailDialog({
  ride,
  onOpenChange,
}: {
  ride: Ride | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRide(id),
    onSuccess: () => {
      toast.success('Ride deleted')
      void queryClient.invalidateQueries({ queryKey: ['rides'] })
      onOpenChange(false)
    },
    onError: (err) => toast.error('Could not delete ride', { description: err.message }),
  })

  if (!ride) return <Dialog open={false} onOpenChange={onOpenChange}><DialogContent /></Dialog>

  return (
    <Dialog open={!!ride} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto scroll-slim border-border bg-panel sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            Ride · {new Date(ride.startedAt).toLocaleString()}
          </DialogTitle>
          <DialogDescription className="text-xs text-text-secondary">
            {ride.routeData.length} GPS points · {ride.status}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <HistoryStat label="Distance" value={formatDistance(ride.distanceMeters)} />
          <HistoryStat label="Duration" value={formatDuration(ride.durationSeconds)} />
          <HistoryStat label="Avg speed" value={formatSpeed(ride.averageSpeed)} />
          <HistoryStat label="Max speed" value={formatSpeed(ride.maximumSpeed)} />
        </div>

        <RideRoute ride={ride} />

        <div className="flex justify-between gap-2">
          <Button asChild size="sm" variant="secondary">
            <a
              href={`/map?lat=${ride.routeData.length ? ride.routeData[0].lat : ''}&lng=${
                ride.routeData.length ? ride.routeData[0].lng : ''
              }&zoom=14`}
            >
              View area on map
            </a>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-status-danger hover:text-status-danger"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (window.confirm('Delete this ride permanently?')) deleteMutation.mutate(ride.id)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete ride
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RideRoute({ ride }: { ride: Ride }) {
  const points = ride.routeData
  if (points.length < 2) {
    return (
      <div className="flex h-36 items-center justify-center rounded-md border border-border bg-panel-2">
        <p className="text-[11px] text-text-muted">No route recorded for this ride.</p>
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
  const h = 200
  const pad = 12
  const dx = Math.max(maxLng - minLng, 1e-6)
  const dy = Math.max(maxLat - minLat, 1e-6)
  const scale = Math.min((w - pad * 2) / dx, (h - pad * 2) / dy)
  const px = (p: { lat: number; lng: number }) =>
    `${pad + (p.lng - minLng) * scale},${h - pad - (p.lat - minLat) * scale}`
  return (
    <div className="overflow-hidden rounded-md border border-border bg-panel-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full" role="img" aria-label="Ride route">
        <polyline
          points={points.map(px).join(' ')}
          fill="none"
          stroke="#F5F5F5"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={pad + (points[0].lng - minLng) * scale} cy={h - pad - (points[0].lat - minLat) * scale} r="4" fill="#F5F5F5" />
        <circle
          cx={pad + (points[points.length - 1].lng - minLng) * scale}
          cy={h - pad - (points[points.length - 1].lat - minLat) * scale}
          r="4"
          fill="#4CAF7D"
        />
      </svg>
    </div>
  )
}
