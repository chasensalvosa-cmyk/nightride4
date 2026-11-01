'use client'

// NIGHTRIDE — core MapLibre container.
// Dark basemap resolved live at boot (Mapbox dark-v11 when a token exists,
// keyless OpenFreeMap dark vector otherwise, keyless Esri World Dark Gray as
// emergency fallback), permission-gated user location dot, click handling and
// a stable imperative API published through MapContext.

import { useEffect, useRef } from 'react'
import { Map as MLMap, Marker, ScaleControl, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { resolveMapStyle } from '@/services/map/mapStyle'
import { MapContext, type MapApi } from './map-context'
import { DEFAULT_VIEW, useMapStore } from '@/stores/map-store'
import type { MapViewState } from '@/types'

// MapLibre v6 resolves its web worker from import.meta.url, which is not an
// http(s) URL inside the Next.js dev server → "Worker failed to load" errors.
// The self-contained worker is served from /public instead (see
// scripts/sync-maplibre-worker.sh to refresh it after upgrades).
if (typeof window !== 'undefined') {
  setWorkerUrl('/maplibre-gl-worker.mjs')
}

export interface MapBounds {
  minLat: number
  minLng: number
  maxLat: number
  maxLng: number
}

export interface MapContainerProps {
  onMapClick?: (lat: number, lng: number) => void
  onMoveEnd?: (view: MapViewState, bounds: MapBounds) => void
  onMapError?: (message: string) => void
  onReady?: (map: MLMap) => void
  /** show the permission-gated user location dot */
  userLocation: { lat: number; lng: number } | null
  children?: React.ReactNode
}

export default function MapContainer({
  onMapClick,
  onMoveEnd,
  onMapError,
  onReady,
  userLocation,
  children,
}: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const userMarkerRef = useRef<Marker | null>(null)
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null)
  const callbacksRef = useRef({ onMapClick, onMoveEnd, onMapError, onReady })
  callbacksRef.current = { onMapClick, onMoveEnd, onMapError, onReady }

  // Initial view comes from the persisted store (keeps state between visits).
  const initialView = useRef<MapViewState>(
    useMapStore.getState().view ?? DEFAULT_VIEW,
  )

  useEffect(() => {
    if (!containerRef.current) return

    let disposed = false
    let map: MLMap | null = null
    let observer: ResizeObserver | null = null

    // Resolve the basemap first (Mapbox token → keyless OpenFreeMap probe →
    // keyless Esri raster), then boot the engine with whatever is actually
    // reachable. The resolved provider is published to the store so the UI
    // label and accessibility text always reflect reality.
    void (async () => {
      const { style, info } = await resolveMapStyle()
      if (disposed || !containerRef.current) return
      useMapStore.getState().setBasemap(info)

      map = new MLMap({
        container: containerRef.current,
        style,
        center: [initialView.current.lng, initialView.current.lat],
        zoom: initialView.current.zoom,
        minZoom: 3,
        maxZoom: 18,
        attributionControl: { compact: true },
        canvasContextAttributes: { antialias: true },
      })
      mapRef.current = map

      map.addControl(new ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left')

      map.on('load', () => {
        // A GPS fix that arrived while the engine was still booting is applied
        // here — otherwise a stationary rider would never see their dot.
        syncUserMarker(mapRef.current)
        callbacksRef.current.onReady?.(map as MLMap)
      })

      map.on('moveend', () => {
        const c = map!.getCenter()
        const b = map!.getBounds()
        const view: MapViewState = {
          lat: c.lat,
          lng: c.lng,
          zoom: map!.getZoom(),
        }
        const bounds: MapBounds = {
          minLat: b.getSouth(),
          minLng: b.getWest(),
          maxLat: b.getNorth(),
          maxLng: b.getEast(),
        }
        useMapStore.getState().setView(view)
        callbacksRef.current.onMoveEnd?.(view, bounds)
      })

      map.on('error', (e) => {
        // Tile/network errors are surfaced but do not destroy the map.
        const msg = e?.error?.message ?? 'Map error'
        if (!msg.toLowerCase().includes('aborted')) {
          callbacksRef.current.onMapError?.(msg)
        }
      })

      map.on('click', (e) => {
        callbacksRef.current.onMapClick?.(e.lngLat.lat, e.lngLat.lng)
      })

      observer = new ResizeObserver(() => {
        map?.resize()
      })
      observer.observe(containerRef.current)
    })()

    return () => {
      disposed = true
      observer?.disconnect()
      map?.remove()
      mapRef.current = null
    }
  }, [])

  // User location dot — rendered ONLY when a real fix exists (permission first).
  // Red dot + soft halo; updated live by the watcher.
  const syncUserMarker = (map: MLMap | null) => {
    if (!map) return
    const loc = userLocationRef.current
    if (!loc) {
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      return
    }
    if (!userMarkerRef.current) {
      const el = document.createElement('div')
      el.className = 'flex flex-col items-center'
      el.setAttribute('role', 'img')
      el.setAttribute('aria-label', 'Your current location')
      el.innerHTML =
        '<div class="nr-userdot-halo"></div><div class="nr-userdot" style="margin-top:-15px"></div>'
      userMarkerRef.current = new Marker({ element: el })
        .setLngLat([loc.lng, loc.lat])
        .addTo(map)
    } else {
      userMarkerRef.current.setLngLat([loc.lng, loc.lat])
    }
  }

  useEffect(() => {
    userLocationRef.current = userLocation
    syncUserMarker(mapRef.current)
  }, [userLocation])

  const api: MapApi = {
    getMap: () => mapRef.current,
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    flyTo: (view, options) => {
      const map = mapRef.current
      if (!map) return
      const current = map.getCenter()
      map.flyTo({
        center: [view.lng ?? current.lng, view.lat ?? current.lat],
        zoom: view.zoom ?? map.getZoom(),
        duration: options?.duration ?? 900,
        essential: true,
      })
    },
    fitBounds: (bounds, padding = 60) => {
      mapRef.current?.fitBounds(
        [
          [bounds.minLng, bounds.minLat],
          [bounds.maxLng, bounds.maxLat],
        ],
        { padding, maxZoom: 15, duration: 700 },
      )
    },
  }

  // Reflects the basemap actually resolved at boot (probe-driven).
  const basemapLabel = useMapStore((s) => s.basemap.label)

  return (
    <MapContext.Provider value={api}>
      <div className="relative h-full w-full">
        {/* MapLibre forces position:relative on its container (its own CSS
            beats the Tailwind `absolute` utility), so the container gets an
            explicit size instead of absolute inset positioning. */}
        <div
          ref={containerRef}
          className="h-full w-full"
          role="application"
          aria-label={`NIGHTRIDE live map — ${basemapLabel} basemap`}
        />
        {/* overlays: pointer events opt-in per element */}
        <div className="pointer-events-none absolute inset-0">{children}</div>
      </div>
    </MapContext.Provider>
  )
}
