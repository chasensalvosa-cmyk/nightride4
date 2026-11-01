'use client'

// NIGHTRIDE — location details panel for the map: shows the selected
// marker's real data (report / charging / camera / aircraft / rider) or a
// clicked point with reverse-geocoded address, plus contextual actions.

import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Flag, Loader2, MapPin, ShieldCheck, X } from 'lucide-react'
import { formatCoordinate } from '@/lib/geo'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { REPORT_CATEGORY_META } from '@/lib/categories'
import { RelativeTime, FreshnessBadge } from '@/components/shared/status'
import { CategoryBadge } from '@/components/shared/panels'
import { Button } from '@/components/ui/button'
import type {
  AircraftState,
  ChargingStation,
  CommunityReport,
  FreshData,
  PublicCameraLocation,
  RiderPresence,
} from '@/types'

export type MapSelection =
  | { kind: 'report'; report: CommunityReport }
  | { kind: 'charging'; station: ChargingStation }
  | { kind: 'camera'; camera: PublicCameraLocation }
  | { kind: 'aircraft'; aircraft: AircraftState }
  | { kind: 'rider'; rider: RiderPresence }
  | { kind: 'point'; lat: number; lng: number }

interface PointAddress {
  label: string
  detail: string
}

export function LocationPanel({
  selection,
  onClose,
  onReportHere,
  onSaveHere,
  onConfirmReport,
  onFlagReport,
  canModerate,
}: {
  selection: MapSelection
  onClose: () => void
  onReportHere: (lat: number, lng: number, label?: string) => void
  onSaveHere: (lat: number, lng: number, label?: string) => void
  onConfirmReport?: (reportId: string) => void
  onFlagReport?: (reportId: string) => void
  canModerate: boolean
}) {
  return (
    <div className="pointer-events-auto flex max-h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-panel md:w-80">
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
        <p className="label-micro">Location details</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-soft hover:bg-hover hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="max-h-[55vh] overflow-y-auto scroll-slim p-3.5">
        {selection.kind === 'report' && (
          <ReportDetails
            report={selection.report}
            onConfirm={onConfirmReport}
            onFlag={onFlagReport}
            canModerate={canModerate}
          />
        )}
        {selection.kind === 'charging' && <ChargingDetails station={selection.station} />}
        {selection.kind === 'camera' && <CameraDetails camera={selection.camera} />}
        {selection.kind === 'aircraft' && <AircraftDetails aircraft={selection.aircraft} />}
        {selection.kind === 'rider' && <RiderDetails rider={selection.rider} />}
        {selection.kind === 'point' && (
          <PointDetails
            lat={selection.lat}
            lng={selection.lng}
            onReportHere={onReportHere}
            onSaveHere={onSaveHere}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- sections

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</span>
      <span className="text-right text-xs text-foreground">{value}</span>
    </div>
  )
}

function ReportDetails({
  report,
  onConfirm,
  onFlag,
  canModerate,
}: {
  report: CommunityReport
  onConfirm?: (id: string) => void
  onFlag?: (id: string) => void
  canModerate: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CategoryBadge category={report.category} />
        {report.verificationStatus === 'confirmed' && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-status-success">
            <ShieldCheck className="h-3 w-3" aria-hidden /> Verified
          </span>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold leading-snug text-foreground">{report.title}</h3>
        {report.locationLabel && (
          <p className="mt-0.5 text-[11px] text-text-muted">{report.locationLabel}</p>
        )}
        <p className="mt-2 text-xs leading-relaxed text-text-secondary">{report.description}</p>
      </div>
      <div className="rounded-md border border-border bg-panel-2 px-2.5 py-1.5">
        <Row label="Status" value={report.status === 'open' ? 'Open' : report.status === 'resolved' ? 'Resolved' : 'Closed'} />
        <Row label="Confirmations" value={`${report.confirmationCount}`} />
        <Row label="Comments" value={`${report.commentCount}`} />
        <Row label="By" value={report.author?.username ?? 'Unknown'} />
        <Row label="Reported" value={<RelativeTime iso={report.createdAt} />} />
        {report.expiresAt && (
          <Row label="Expires" value={<RelativeTime iso={report.expiresAt} />} />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="secondary">
          <a href={`/community?report=${report.id}`}>Open thread</a>
        </Button>
        {canModerate && report.status === 'open' && onConfirm && (
          <Button size="sm" variant="secondary" onClick={() => onConfirm(report.id)}>
            Confirm
          </Button>
        )}
        {onFlag && (
          <Button size="sm" variant="ghost" onClick={() => onFlag(report.id)}>
            <Flag className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Report abuse
          </Button>
        )}
      </div>
    </div>
  )
}

function ChargingDetails({ station }: { station: ChargingStation }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold leading-snug text-foreground">{station.name}</h3>
      <div className="rounded-md border border-border bg-panel-2 px-2.5 py-1.5">
        <Row label="Operator" value={station.operator ?? '—'} />
        <Row label="Capacity" value={station.capacity ? `${station.capacity} connectors` : 'Unknown'} />
        <Row label="Sockets" value={station.socketTypes.length ? station.socketTypes.join(', ') : 'Unlisted'} />
        <Row label="Coordinates" value={formatCoordinate(station.latitude, 'lat')} />
      </div>
      <p className="text-[10px] leading-relaxed text-text-muted">
        Data from OpenStreetMap (ODbL). Details may change — verify on site.
      </p>
      <Button asChild size="sm" variant="secondary">
        <a href={station.sourceUrl} target="_blank" rel="noreferrer">
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden /> View on OpenStreetMap
        </a>
      </Button>
    </div>
  )
}

function CameraDetails({ camera }: { camera: PublicCameraLocation }) {
  const isAlpr = camera.cameraType === 'alpr'
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold leading-snug text-foreground">{camera.name}</h3>
      <div className="rounded-md border border-border bg-panel-2 px-2.5 py-1.5">
        <Row label="Type" value={isAlpr ? 'License plate reader (ALPR)' : camera.cameraType} />
        {camera.brand && <Row label="Brand" value={camera.brand} />}
        <Row label="Verified" value={<RelativeTime iso={camera.lastVerifiedAt} />} />
        <Row label="Coordinates" value={formatCoordinate(camera.latitude, 'lat')} />
        {camera.sourceName && <Row label="Source" value={camera.sourceName} />}
      </div>
      <p className="text-[10px] leading-relaxed text-text-muted">
        {isAlpr
          ? 'ALPR camera location from the DeFlock / OpenStreetMap open-data inventory — community-mapped, no live feed is accessed.'
          : 'Documented public traffic camera. No live video is accessed — location record only.'}
      </p>
      <Button asChild size="sm" variant="secondary">
        <a href={camera.sourceUrl} target="_blank" rel="noreferrer">
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Public source
        </a>
      </Button>
    </div>
  )
}

function AircraftDetails({ aircraft }: { aircraft: AircraftState }) {
  const altitudeM = aircraft.baroAltitude ?? aircraft.geoAltitude
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold leading-snug text-foreground">
        {aircraft.callsign ?? `Aircraft ${aircraft.icao24.toUpperCase()}`}
      </h3>
      <div className="rounded-md border border-border bg-panel-2 px-2.5 py-1.5">
        <Row label="Origin" value={aircraft.originCountry} />
        <Row
          label="Altitude"
          value={altitudeM != null ? `${Math.round(altitudeM)} m` : '—'}
        />
        <Row
          label="Speed"
          value={aircraft.velocity != null ? `${Math.round(aircraft.velocity * 3.6)} km/h` : '—'}
        />
        <Row
          label="Vertical"
          value={
            aircraft.verticalRate != null
              ? `${aircraft.verticalRate > 0 ? '↑' : aircraft.verticalRate < 0 ? '↓' : ''} ${Math.abs(Math.round(aircraft.verticalRate))} m/s`
              : '—'
          }
        />
        <Row label="State" value={aircraft.onGround ? 'On ground' : 'Airborne'} />
      </div>
      <p className="text-[10px] leading-relaxed text-text-muted">
        General air-traffic awareness from public ADS-B data (OpenSky Network). Aggregate awareness
        only — no identification or tracking of specific operators.
      </p>
    </div>
  )
}

function RiderDetails({ rider }: { rider: RiderPresence }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold leading-snug text-foreground">{rider.username}</h3>
      <div className="rounded-md border border-border bg-panel-2 px-2.5 py-1.5">
        <Row label="Speed" value={rider.speedKmh != null ? `${Math.round(rider.speedKmh)} km/h` : '—'} />
        <Row label="Heading" value={rider.heading != null ? `${Math.round(rider.heading)}°` : '—'} />
        <Row label="Updated" value={<RelativeTime iso={new Date(rider.updatedAt).toISOString()} />} />
      </div>
      <p className="text-[10px] leading-relaxed text-text-muted">
        This rider is explicitly sharing their position during a ride. Sharing stops automatically
        when they stop.
      </p>
    </div>
  )
}

function PointDetails({
  lat,
  lng,
  onReportHere,
  onSaveHere,
}: {
  lat: number
  lng: number
  onReportHere: (lat: number, lng: number, label?: string) => void
  onSaveHere: (lat: number, lng: number, label?: string) => void
}) {
  const { data, isFetching } = useQuery({
    queryKey: ['reverse', lat.toFixed(5), lng.toFixed(5)],
    queryFn: () =>
      api.get<FreshData<PointAddress | null>>(
        `/api/external/geocode?lat=${lat}&lng=${lng}`,
      ),
    staleTime: Infinity,
  })
  const address = data?.data ?? null

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        <div className="min-w-0">
          {isFetching ? (
            <p className="flex items-center gap-1.5 text-xs text-text-muted">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Looking up address…
            </p>
          ) : address ? (
            <>
              <p className="text-sm font-medium leading-snug text-foreground">{address.label}</p>
              {address.detail && <p className="text-[11px] text-text-muted">{address.detail}</p>}
            </>
          ) : (
            <p className="text-xs text-text-secondary">Selected point</p>
          )}
        </div>
      </div>
      <div className="rounded-md border border-border bg-panel-2 px-2.5 py-1.5">
        <Row label="Latitude" value={formatCoordinate(lat, 'lat')} />
        <Row label="Longitude" value={formatCoordinate(lng, 'lng')} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onReportHere(lat, lng, address ? `${address.label}${address.detail ? `, ${address.detail}` : ''}` : undefined)}>
          Report here
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onSaveHere(lat, lng, address?.label)}>
          Save location
        </Button>
      </div>
    </div>
  )
}
