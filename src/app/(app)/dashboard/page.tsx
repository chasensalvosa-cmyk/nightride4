'use client'

// NIGHTRIDE — dashboard: welcome, rider status, quick map, recent ride,
// nearby reports, road condition alerts, public safety announcements and
// saved locations. Compact; refreshes live via realtime events.

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  WelcomeHeader,
  NearbyReportsCard,
  QuickMapCard,
  RecentRideCard,
  RiderStatusCard,
  RoadConditionAlertsCard,
  SafetyAnnouncementsCard,
  SavedLocationsCard,
} from '@/components/dashboard/dashboard-cards'
import { fetchReports } from '@/services/community/communityService'
import { fetchRides } from '@/services/rides/rideService'
import { fetchSavedLocations } from '@/services/locations/savedLocationService'
import { fetchPublicSafety } from '@/services/publicSafety/publicSafetyService'
import { fetchApiStatus } from '@/services/publicSafety/apiStatusService'
import { APP_BUILD } from '@/lib/build'
import { useAuth } from '@/hooks/use-auth'
import { useRealtime } from '@/hooks/use-realtime'
import { useRealtimeStore } from '@/stores/realtime-store'
import { useMapStore } from '@/stores/map-store'
import { formatCoordinate } from '@/lib/geo'

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const realtimeConnected = useRealtimeStore((s) => s.connected)
  const mapView = useMapStore((s) => s.view)
  const queryClient = useQueryClient()

  // GPS state without prompting (permission API); the map/rides pages prompt.
  const [gpsState, setGpsState] = useState<'unknown' | 'granted' | 'denied' | 'unavailable'>('unknown')
  const [gpsFix, setGpsFix] = useState<{ lat: number; lng: number } | null>(null)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((p) => {
        setGpsState(p.state === 'granted' ? 'granted' : p.state === 'denied' ? 'denied' : 'unknown')
        p.onchange = () =>
          setGpsState(p.state === 'granted' ? 'granted' : p.state === 'denied' ? 'denied' : 'unknown')
      })
      .catch(() => undefined)
  }, [])

  // One-shot fix when permission is already granted (no prompt).
  useEffect(() => {
    if (gpsState !== 'granted' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setGpsFix({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => undefined,
      { timeout: 8000 },
    )
  }, [gpsState])

  // Reference point for "nearby": granted GPS fix (if available) or last map view.
  const reference = useMemo(
    () =>
      gpsFix
        ? { lat: gpsFix.lat, lng: gpsFix.lng, label: 'your GPS position' }
        : { lat: mapView.lat, lng: mapView.lng, label: 'last map position' },
    [gpsFix, mapView.lat, mapView.lng],
  )

  const signedIn = !!user && !authLoading

  const reportsQuery = useQuery({
    queryKey: ['reports', 'dashboard', reference?.lat.toFixed(3), reference?.lng.toFixed(3)],
    queryFn: () =>
      fetchReports({
        lat: reference?.lat,
        lng: reference?.lng,
        sort: reference ? 'nearby' : 'recent',
        limit: 12,
      }),
    enabled: true,
    staleTime: 60_000,
  })

  const ridesQuery = useQuery({
    queryKey: ['rides', 'recent'],
    queryFn: () => fetchRides('completed'),
    enabled: signedIn,
    staleTime: 30_000,
  })

  const activeRideQuery = useQuery({
    queryKey: ['active-ride'],
    queryFn: () => fetchRides().then((r) => r.rides.find((x) => x.status !== 'completed') ?? null),
    enabled: signedIn,
    staleTime: 15_000,
  })

  const savedQuery = useQuery({
    queryKey: ['saved-locations'],
    queryFn: fetchSavedLocations,
    enabled: signedIn,
    staleTime: 60_000,
  })

  const safetyQuery = useQuery({
    queryKey: ['public-safety', 'dashboard'],
    queryFn: fetchPublicSafety,
    staleTime: 2 * 60_000,
  })

  const statusQuery = useQuery({
    queryKey: ['api-status'],
    queryFn: fetchApiStatus,
    staleTime: 45_000,
  })

  // Live updates: refresh the feed when a report or safety event is pushed.
  useRealtime({
    onReportNew: () => {
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
    onSafetyNew: () => {
      void queryClient.invalidateQueries({ queryKey: ['public-safety'] })
    },
  })

  const reports = useMemo(() => reportsQuery.data?.reports ?? [], [reportsQuery.data])
  const roadConditionReports = useMemo(
    () =>
      reports.filter((r) =>
        ['road_hazard', 'damaged_road', 'construction', 'road_closure'].includes(r.category),
      ),
    [reports],
  )

  const dataProviders = (statusQuery.data?.providers ?? []).filter((p) =>
    ['aviation', 'charging', 'public_safety'].includes(p.key),
  )
  const dataProvidersOk = dataProviders.length
    ? dataProviders.some((p) => p.status === 'connected')
    : null

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 lg:p-6">
      <WelcomeHeader username={user?.username ?? null} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <RiderStatusCard
          signedIn={signedIn}
          gps={gpsState}
          activeRide={activeRideQuery.data ?? null}
          realtime={realtimeConnected}
          dataProvidersOk={dataProvidersOk}
          referenceLabel={
            reference
              ? `${formatCoordinate(reference.lat, 'lat')}, ${reference.label}`
              : 'default area'
          }
        />
        <QuickMapCard />
        <RecentRideCard
          ride={ridesQuery.data?.rides?.[0] ?? null}
          loading={signedIn && ridesQuery.isLoading}
          signedIn={signedIn}
        />
        <NearbyReportsCard
          reports={reports}
          loading={reportsQuery.isLoading}
          hasReference={!!reference && reference.label === 'your GPS position'}
        />
        <RoadConditionAlertsCard
          reports={roadConditionReports}
          loading={reportsQuery.isLoading}
        />
        <SafetyAnnouncementsCard
          events={safetyQuery.data?.data ?? []}
          loading={safetyQuery.isLoading}
          freshness={safetyQuery.data?.freshness ?? 'unavailable'}
          fetchedAt={safetyQuery.data?.fetchedAt ?? null}
          note={safetyQuery.data?.note}
        />
        <p className="pt-1 text-center text-[10px] uppercase tracking-wider text-text-muted" data-build={APP_BUILD}>
          NIGHTRIDE · build {APP_BUILD}
        </p>
        <div className="md:col-span-2 lg:col-span-3">
          <SavedLocationsCard
            locations={savedQuery.data?.locations ?? []}
            loading={signedIn && savedQuery.isLoading}
            signedIn={signedIn}
          />
        </div>
      </div>
    </div>
  )
}
