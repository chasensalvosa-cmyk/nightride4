'use client'

// NIGHTRIDE — live map experience.
// Assembles the MapLibre engine with: search, 7 independent data layers,
// permission-gated GPS + recenter, location details, report submission,
// consent-based presence sharing, API status and legend.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Map as MLMap } from 'maplibre-gl'
import { MapPin, Radio, TriangleAlert } from 'lucide-react'
import MapContainer, { type MapBounds } from './MapContainer'
import { MapControls } from './MapControls'
import { MapLayers, type LayerStatus } from './MapLayers'
import { MapSearch } from './MapSearch'
import { MapLegend } from './MapLegend'
import { LocationPanel, type MapSelection } from './LocationPanel'
import { MarkerRenderer, type MapMarkerData } from './MarkerRenderer'
import { ReportSheet, type ReportDraft } from './ReportSheet'
import { SaveLocationDialog, type SaveLocationDraft } from '@/components/shared/save-location-dialog'
import { FlagDialog } from '@/components/shared/flag-dialog'
import { StatusDot } from '@/components/shared/status'
import { Button } from '@/components/ui/button'
import { useMapStore, DEFAULT_VIEW } from '@/stores/map-store'
import { useRealtimeStore } from '@/stores/realtime-store'
import { useAuth } from '@/hooks/use-auth'
import { useGeolocation } from '@/hooks/use-geolocation'
import { useRealtime } from '@/hooks/use-realtime'
import { fetchReports, confirmReport } from '@/services/community/communityService'
import { fetchChargingStations } from '@/services/map/chargingService'
import { fetchAviation } from '@/services/aviation/aviationService'
import { fetchCameras } from '@/services/cameras/cameraService'
import { fetchApiStatus } from '@/services/publicSafety/apiStatusService'
import type { CommunityReport, ReportCategory } from '@/types'

const HAZARD_CATEGORIES: ReportCategory[] = ['road_hazard', 'damaged_road', 'construction', 'general_safety']
const CLOSURE_CATEGORIES: ReportCategory[] = ['road_closure']
const RIDING_CATEGORIES: ReportCategory[] = ['riding_location']
const POLICE_CATEGORIES: ReportCategory[] = ['police_activity']

function categoryIcon(category: ReportCategory): MapMarkerData['icon'] {
  switch (category) {
    case 'road_hazard': return 'hazard'
    case 'damaged_road': return 'damage'
    case 'construction': return 'construction'
    case 'road_closure': return 'closure'
    case 'charging_station': return 'charging'
    case 'riding_location': return 'riding'
    case 'police_activity': return 'police'
    default: return 'safety'
  }
}

export default function MapView() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const layers = useMapStore((s) => s.layers)
  const setLayer = useMapStore((s) => s.setLayer)
  const view = useMapStore((s) => s.view)
  const basemapLabel = useMapStore((s) => s.basemap.label)

  const [mapInstance, setMapInstance] = useState<MLMap | null>(null)
  const [bounds, setBounds] = useState<MapBounds | null>(null)
  const [selection, setSelection] = useState<MapSelection | null>(null)
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveDraft, setSaveDraft] = useState<SaveLocationDraft | null>(null)
  const [flagTarget, setFlagTarget] = useState<string | null>(null)
  const [flagOpen, setFlagOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  const deepLinkApplied = useRef(false)

  const geo = useGeolocation({ auto: false })
  const sharingPresence = useRealtimeStore((s) => s.sharingPresence)
  const setSharingPresence = useRealtimeStore((s) => s.setSharingPresence)
  const realtimeConnected = useRealtimeStore((s) => s.connected)
  const riders = useRealtimeStore((s) => s.riders)

  // ------------------------------------------------------------ deep links
  // Waits for the live map instance: applying coordinates before the engine
  // is ready silently no-ops (and the ref guard would then swallow the retry).
  const searchParams = useSearchParams()
  useEffect(() => {
    if (deepLinkApplied.current) return
    const lat = Number.parseFloat(searchParams.get('lat') ?? '')
    const lng = Number.parseFloat(searchParams.get('lng') ?? '')
    const zoom = Number.parseFloat(searchParams.get('zoom') ?? '')
    const layerParam = searchParams.get('layers')
    if (!mapInstance && (Number.isFinite(lat) || layerParam)) return
    deepLinkApplied.current = true
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      useMapStore.getState().setView({
        lat,
        lng,
        ...(Number.isFinite(zoom) ? { zoom } : {}),
      })
      mapInstance?.flyTo({ center: [lng, lat], zoom: Number.isFinite(zoom) ? zoom : view.zoom })
    }
    if (layerParam) {
      for (const id of layerParam.split(',')) {
        if (id in layers) setLayer(id as keyof typeof layers, true)
      }
    }
  }, [searchParams, mapInstance])

  const mapApiRef = useRef<MLMap | null>(null)
  const handleMapReady = useCallback((map: MLMap) => {
    mapApiRef.current = map
    setMapInstance(map)
    // Seed layer bounds immediately (queries keyed on bounds start at once).
    const b = map.getBounds()
    setBounds({ minLat: b.getSouth(), minLng: b.getWest(), maxLat: b.getNorth(), maxLng: b.getEast() })
  }, [])

  // ------------------------------------------------------------ data layers
  const anyReportLayer =
    layers.road_hazards || layers.road_closures || layers.riding_areas || layers.charging || layers.police_activity

  const reportsQuery = useQuery({
    queryKey: ['map-reports'],
    queryFn: () => fetchReports({ limit: 200 }),
    enabled: anyReportLayer,
    staleTime: 60_000,
  })

  const centerKey = `${view.lat.toFixed(2)}:${view.lng.toFixed(2)}`
  const chargingQuery = useQuery({
    queryKey: ['charging', centerKey],
    queryFn: () => fetchChargingStations(view.lat, view.lng, 9000),
    enabled: layers.charging,
    staleTime: 5 * 60_000,
  })

  const bboxKey = bounds
    ? `${bounds.minLat.toFixed(1)}:${bounds.minLng.toFixed(1)}:${bounds.maxLat.toFixed(1)}:${bounds.maxLng.toFixed(1)}`
    : 'none'
  const aviationQuery = useQuery({
    queryKey: ['aviation', bboxKey],
    queryFn: () =>
      fetchAviation({
        minLat: bounds!.minLat,
        minLng: bounds!.minLng,
        maxLat: bounds!.maxLat,
        maxLng: bounds!.maxLng,
      }),
    enabled: layers.aviation && !!bounds,
    refetchInterval: 15_000,
    staleTime: 10_000,
  })

  const camerasQuery = useQuery({
    queryKey: ['cameras', bboxKey],
    queryFn: () =>
      fetchCameras(
        bounds
          ? {
              minLat: bounds.minLat,
              minLng: bounds.minLng,
              maxLat: bounds.maxLat,
              maxLng: bounds.maxLng,
            }
          : undefined,
      ),
    enabled: layers.cameras && !!bounds,
    staleTime: 5 * 60_000,
  })

  const statusQuery = useQuery({
    queryKey: ['api-status'],
    queryFn: fetchApiStatus,
    refetchInterval: 60_000,
    staleTime: 45_000,
  })

  // Realtime → refresh layer data when community events arrive.
  useRealtime({
    onReportNew: () => {
      void queryClient.invalidateQueries({ queryKey: ['map-reports'] })
    },
    onReportUpdated: () => {
      void queryClient.invalidateQueries({ queryKey: ['map-reports'] })
    },
    onCommentNew: () => {
      void queryClient.invalidateQueries({ queryKey: ['map-reports'] })
    },
  })

  const reports = useMemo(() => reportsQuery.data?.reports ?? [], [reportsQuery.data])
  const stations = useMemo(
    () => [
      ...(chargingQuery.data?.data ?? []),
      ...(layers.charging
        ? reports
            .filter((r) => r.category === 'charging_station')
            .map((r) => ({
              id: `report-${r.id}`,
              name: r.title,
              latitude: r.latitude,
              longitude: r.longitude,
              operator: null,
              capacity: null,
              socketTypes: [],
              sourceUrl: `/community?report=${r.id}`,
            }))
        : []),
    ],
    [chargingQuery.data, reports, layers.charging],
  )
  const aircraft = useMemo(() => aviationQuery.data?.data ?? [], [aviationQuery.data])
  const cameras = useMemo(() => camerasQuery.data?.data ?? [], [camerasQuery.data])

  // ------------------------------------------------------------ markers
  const markers = useMemo<MapMarkerData[]>(() => {
    const list: MapMarkerData[] = []

    if (layers.road_hazards || layers.road_closures || layers.riding_areas || layers.police_activity) {
      for (const r of reports) {
        const isHazard = HAZARD_CATEGORIES.includes(r.category)
        const isClosure = CLOSURE_CATEGORIES.includes(r.category)
        const isRiding = RIDING_CATEGORIES.includes(r.category)
        const isPolice = POLICE_CATEGORIES.includes(r.category)
        const show =
          (isHazard && layers.road_hazards) ||
          (isClosure && layers.road_closures) ||
          (isRiding && layers.riding_areas) ||
          (isPolice && layers.police_activity)
        if (!show) continue
        list.push({
          id: `report-${r.id}`,
          layer: 'report',
          lat: r.latitude,
          lng: r.longitude,
          icon: categoryIcon(r.category),
          label: r.title,
          selected: selectedMarkerId === `report-${r.id}`,
          onClick: () => {
            setSelectedMarkerId(`report-${r.id}`)
            setSelection({ kind: 'report', report: r })
          },
        })
      }
    }

    if (layers.charging) {
      for (const s of stations) {
        list.push({
          id: `chg-${s.id}`,
          layer: 'charging',
          lat: s.latitude,
          lng: s.longitude,
          icon: 'charging',
          label: s.name,
          selected: selectedMarkerId === `chg-${s.id}`,
          onClick: () => {
            setSelectedMarkerId(`chg-${s.id}`)
            setSelection({ kind: 'charging', station: s })
          },
        })
      }
    }

    if (layers.cameras && camerasQuery.data?.freshness !== 'unavailable') {
      for (const c of cameras) {
        list.push({
          id: `cam-${c.id}`,
          layer: 'cameras',
          lat: c.latitude,
          lng: c.longitude,
          icon: c.cameraType === 'alpr' ? 'alpr' : 'camera',
          label: c.name,
          selected: selectedMarkerId === `cam-${c.id}`,
          onClick: () => {
            setSelectedMarkerId(`cam-${c.id}`)
            setSelection({ kind: 'camera', camera: c })
          },
        })
      }
    }

    if (layers.aviation && aviationQuery.data?.freshness !== 'unavailable') {
      for (const a of aircraft) {
        list.push({
          id: `av-${a.icao24}`,
          layer: 'aviation',
          lat: a.latitude,
          lng: a.longitude,
          icon: 'plane',
          rotate: a.trueTrack,
          label: a.callsign ?? a.icao24,
          selected: selectedMarkerId === `av-${a.icao24}`,
          onClick: () => {
            setSelectedMarkerId(`av-${a.icao24}`)
            setSelection({ kind: 'aircraft', aircraft: a })
          },
        })
      }
    }

    if (layers.riders) {
      for (const r of riders) {
        list.push({
          id: `rider-${r.userId}`,
          layer: 'riders',
          lat: r.lat,
          lng: r.lng,
          icon: 'rider',
          label: r.username,
          selected: selectedMarkerId === `rider-${r.userId}`,
          onClick: () => {
            setSelectedMarkerId(`rider-${r.userId}`)
            setSelection({ kind: 'rider', rider: r })
          },
        })
      }
    }

    return list
  }, [layers, reports, stations, cameras, aircraft, riders, selectedMarkerId, camerasQuery.data, aviationQuery.data])

  // ------------------------------------------------------------ presence (explicit consent)
  const { sharePresence, stopPresence } = useRealtime({})
  const canSharePresence = !!user && geo.permission === 'granted'

  const handleSharePresence = useCallback(
    (share: boolean) => {
      if (share && !canSharePresence) {
        toast.error('Cannot share position', {
          description: user
            ? 'Grant location permission first (tap the recenter control).'
            : 'Sign in, then grant location permission to share your position.',
        })
        return
      }
      setSharingPresence(share)
      if (!share) stopPresence()
    },
    [canSharePresence, user, setSharingPresence, stopPresence],
  )

  useEffect(() => {
    if (!sharingPresence || !user || !geo.coords) return
    const emit = () => {
      const c = geo.coords
      if (!c) return
      sharePresence({
        userId: user.id,
        username: user.username,
        lat: c.lat,
        lng: c.lng,
        heading: c.heading,
        speedKmh: c.speed != null ? c.speed * 3.6 : null,
      })
    }
    emit()
    const timer = setInterval(emit, 5000)
    return () => clearInterval(timer)
  }, [sharingPresence, user, geo.coords?.lat, geo.coords?.lng])

  useEffect(() => {
    return () => {
      // leaving the map stops sharing — consent is page-scoped
      if (useRealtimeStore.getState().sharingPresence) {
        stopPresence()
        useRealtimeStore.getState().setSharingPresence(false)
      }
    }
  }, [stopPresence])

  // ------------------------------------------------------------ GPS + recenter
  const recenter = useCallback(async () => {
    setLocating(true)
    try {
      let coords = geo.coords
      if (!coords) {
        coords = await geo.requestOnce()
      }
      if (coords) {
        geo.start()
        mapInstance?.flyTo({ center: [coords.lng, coords.lat], zoom: Math.max(view.zoom, 14), duration: 900 })
      } else {
        toast.error('Location unavailable', {
          description: geo.error ?? 'Grant location permission to center the map on your position.',
        })
      }
    } finally {
      setLocating(false)
    }
  }, [geo.coords, geo.error, mapInstance, view.zoom])

  // ------------------------------------------------------------ report / save / confirm / flag
  const openReport = useCallback(
    (lat: number, lng: number, label?: string) => {
      setReportDraft({ lat, lng, label })
      setReportOpen(true)
    },
    [],
  )

  const confirmMutation = useMutation({
    mutationFn: (id: string) => confirmReport(id),
    onSuccess: (res) => {
      toast.success(`Confirmed — ${res.confirmationCount} total`)
      void queryClient.invalidateQueries({ queryKey: ['map-reports'] })
    },
    onError: (err) => {
      toast.error('Could not confirm', {
        description: err.message.includes('Sign in') ? 'Sign in to confirm reports.' : err.message,
      })
    },
  })

  // ------------------------------------------------------------ layer statuses
  const layerStatuses: Partial<Record<keyof typeof layers, LayerStatus>> = useMemo(() => {
    const out: Partial<Record<keyof typeof layers, LayerStatus>> = {
      riders: { count: riders.length },
      road_hazards: { count: reports.filter((r) => HAZARD_CATEGORIES.includes(r.category)).length },
      road_closures: { count: reports.filter((r) => CLOSURE_CATEGORIES.includes(r.category)).length },
      riding_areas: { count: reports.filter((r) => RIDING_CATEGORIES.includes(r.category)).length },
      police_activity: { count: reports.filter((r) => POLICE_CATEGORIES.includes(r.category)).length },
      charging: { count: stations.length, loading: chargingQuery.isFetching },
    }
    if (layers.cameras) {
      out.cameras =
        camerasQuery.data?.freshness === 'unavailable'
          ? { unavailable: 'No source synced' }
          : { count: cameras.length, loading: camerasQuery.isFetching }
    }
    if (layers.aviation) {
      out.aviation =
        aviationQuery.data?.freshness === 'unavailable'
          ? { unavailable: aviationQuery.data?.note?.slice(0, 48) ?? 'Unreachable' }
          : { count: aircraft.length, loading: aviationQuery.isFetching }
    }
    return out
  }, [riders.length, reports, stations.length, chargingQuery.isFetching, camerasQuery, cameras.length, aviationQuery, aircraft.length, layers.cameras, layers.aviation])

  const basemapProvider = statusQuery.data?.providers.find((p) => p.key === 'mapbox')
  const osmProvider = statusQuery.data?.providers.find((p) => p.key === 'osm')
  const dataProviders = statusQuery.data?.providers.filter((p) =>
    ['aviation', 'charging', 'public_safety'].includes(p.key),
  )
  const dataOk =
    !!dataProviders && dataProviders.some((p) => p.status === 'connected')
  const dataAnyMissing = !!dataProviders && dataProviders.every((p) => p.status !== 'connected')

  return (
    <div className="relative h-full w-full bg-background">
      <MapContainer
        onReady={handleMapReady}
        onMoveEnd={(_view, b) => setBounds(b)}
        onMapClick={(lat, lng) => {
          setSelection({ kind: 'point', lat, lng })
          setSelectedMarkerId(null)
        }}
        onMapError={(msg) => setMapError(msg)}
        userLocation={geo.coords ? { lat: geo.coords.lat, lng: geo.coords.lng } : null}
      >
        {/* top-left: search + status */}
        <div className="absolute left-3 top-3 z-10 flex w-[calc(100%-9rem)] max-w-xs flex-col gap-2 md:w-80">
          <MapSearch
            onSelect={(r) => {
              setSelectedMarkerId(null)
              mapInstance?.flyTo({ center: [r.longitude, r.latitude], zoom: 14, duration: 900 })
              setSelection({ kind: 'point', lat: r.latitude, lng: r.longitude })
            }}
          />
          <div className="pointer-events-auto rounded-lg border border-border bg-panel/95 px-3 py-2 backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                <StatusDot
                  status={
                    basemapProvider?.status === 'connected' || osmProvider?.status === 'connected'
                      ? 'connected'
                      : 'error'
                  }
                />
                Map
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                <StatusDot status={dataAnyMissing ? 'error' : dataOk ? 'connected' : 'missing'} />
                Data
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                <StatusDot status={realtimeConnected ? 'connected' : 'missing'} />
                Live
              </span>
              <span className="ml-auto hidden text-[10px] text-text-muted md:inline">
                {basemapLabel}
              </span>
            </div>
            {mapError && (
              <p className="mt-1 truncate text-[10px] text-status-warning" title={mapError}>
                {mapError}
              </p>
            )}
          </div>

          {/* location details (desktop) */}
          {selection && (
            <div className="hidden md:block">
              <LocationPanel
                selection={selection}
                onClose={() => {
                  setSelection(null)
                  setSelectedMarkerId(null)
                }}
                onReportHere={openReport}
                onSaveHere={(lat, lng, label) => {
                  setSaveDraft({ lat, lng, label })
                  setSaveOpen(true)
                }}
                onConfirmReport={(id) => confirmMutation.mutate(id)}
                onFlagReport={(id) => {
                  setFlagTarget(id)
                  setFlagOpen(true)
                }}
                canModerate={!!user}
              />
            </div>
          )}
        </div>

        {/* top-right: layers */}
        <div className="absolute right-3 top-3 z-10 w-56 md:w-64">
          <MapLayers
            statuses={layerStatuses}
            onSharePresence={handleSharePresence}
            sharingPresence={sharingPresence}
            canSharePresence={canSharePresence}
          />
        </div>

        {/* bottom-right: controls + report */}
        <div className="absolute bottom-20 right-3 z-10 flex flex-col items-end gap-2 md:bottom-8">
          <Button
            size="sm"
            onClick={() => openReport(view.lat, view.lng)}
            className="h-9 gap-1.5 rounded-lg"
          >
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
            Report
          </Button>
          <MapControls onRecenter={recenter} locating={locating} />
        </div>

        {/* bottom-left: legend (desktop only) */}
        <div className="absolute bottom-8 left-3 z-10 hidden md:block">
          <MapLegend />
        </div>

        {/* mobile: location details bottom sheet */}
        {selection && (
          <div className="absolute inset-x-3 bottom-20 z-10 md:hidden">
            <LocationPanel
              selection={selection}
              onClose={() => {
                setSelection(null)
                setSelectedMarkerId(null)
              }}
              onReportHere={openReport}
              onSaveHere={(lat, lng, label) => {
                setSaveDraft({ lat, lng, label })
                setSaveOpen(true)
              }}
              onConfirmReport={(id) => confirmMutation.mutate(id)}
              onFlagReport={(id) => {
                setFlagTarget(id)
                setFlagOpen(true)
              }}
              canModerate={!!user}
            />
          </div>
        )}

        {/* loading indicator while the engine boots */}
        {!mapInstance && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80">
            <div className="flex flex-col items-center gap-3">
              <span className="flex h-10 w-10 animate-pulse items-center justify-center rounded-lg border border-border bg-panel">
                <MapPin className="h-5 w-5 text-text-muted" aria-hidden />
              </span>
              <p className="text-xs text-text-muted">Loading map…</p>
            </div>
          </div>
        )}

        <MarkerRenderer map={mapInstance} markers={markers} />
      </MapContainer>

      <ReportSheet open={reportOpen} draft={reportDraft} onOpenChange={setReportOpen} />
      <SaveLocationDialog open={saveOpen} draft={saveDraft} onOpenChange={setSaveOpen} />
      <FlagDialog
        open={flagOpen}
        onOpenChange={setFlagOpen}
        itemType="report"
        itemId={flagTarget}
      />
    </div>
  )
}
