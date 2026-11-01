'use client'

// NIGHTRIDE — route overlay.
// Draws the chosen route as a bright line with a dark casing (premium
// navigation look) and the alternatives as dashed dim lines, plus the
// destination pin. The view fits to the route once per destination/choice —
// live reroutes while riding do not yank the camera around.

import { useEffect, useRef } from 'react'
import { Marker, type GeoJSONSource, type Map as MLMap } from 'maplibre-gl'
import type { RouteOption } from '@/types'
import { createMarkerElement } from './marker-icons'

const SOURCE_ID = 'nr-routes-src'
const LAYER_ALT = 'nr-route-alt'
const LAYER_ACTIVE = 'nr-route-active'
const LAYER_ACTIVE_CASING = 'nr-route-active-casing'

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

export function RouteOverlay({
  map,
  routes,
  activeIndex,
  destination,
  /** change this string to refit the camera (new destination / other pick) */
  fitKey,
}: {
  map: MLMap | null
  routes: RouteOption[]
  activeIndex: number
  destination: { lat: number; lng: number; label?: string }
  fitKey: string
}) {
  const destMarkerRef = useRef<Marker | null>(null)
  const destElRef = useRef<HTMLElement | null>(null)
  const lastFitRef = useRef<string | null>(null)
  const mapRef = useRef<MLMap | null>(null)

  // keep the latest map instance for the unmount teardown
  useEffect(() => {
    mapRef.current = map
  })

  // ------------------------------------------------------------ lines
  useEffect(() => {
    if (!map) return
    const idx = routes.length > 0 ? Math.min(activeIndex, routes.length - 1) : 0
    const fc: GeoJSON.FeatureCollection =
      routes.length > 0
        ? {
            type: 'FeatureCollection',
            features: routes.map((r, i) => ({
              type: 'Feature',
              properties: { idx: i },
              geometry: { type: 'LineString', coordinates: r.coordinates },
            })),
          }
        : EMPTY_FC

    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, { type: 'geojson', data: fc })
    } else {
      ;(map.getSource(SOURCE_ID) as GeoJSONSource).setData(fc)
    }

    const lineLayout = { 'line-join': 'round', 'line-cap': 'round' } as const
    if (!map.getLayer(LAYER_ALT)) {
      map.addLayer({
        id: LAYER_ALT,
        type: 'line',
        source: SOURCE_ID,
        layout: lineLayout,
        paint: {
          'line-color': '#656565',
          'line-width': 3,
          'line-dasharray': [2.5, 2.5],
          'line-opacity': 0.9,
        },
      })
    }
    if (!map.getLayer(LAYER_ACTIVE_CASING)) {
      map.addLayer({
        id: LAYER_ACTIVE_CASING,
        type: 'line',
        source: SOURCE_ID,
        layout: lineLayout,
        paint: { 'line-color': '#090909', 'line-width': 9, 'line-opacity': 0.9 },
      })
    }
    if (!map.getLayer(LAYER_ACTIVE)) {
      map.addLayer({
        id: LAYER_ACTIVE,
        type: 'line',
        source: SOURCE_ID,
        layout: lineLayout,
        paint: { 'line-color': '#F5F5F5', 'line-width': 4.5 },
      })
    }

    map.setFilter(LAYER_ACTIVE, ['==', ['get', 'idx'], idx])
    map.setFilter(LAYER_ACTIVE_CASING, ['==', ['get', 'idx'], idx])
    map.setFilter(LAYER_ALT, ['!=', ['get', 'idx'], idx])
  }, [map, routes, activeIndex])

  // ------------------------------------------------------------ camera fit
  useEffect(() => {
    if (!map || routes.length === 0) return
    if (lastFitRef.current === fitKey) return
    lastFitRef.current = fitKey
    const route = routes[Math.min(activeIndex, routes.length - 1)]
    let minLng = Infinity
    let maxLng = -Infinity
    let minLat = Infinity
    let maxLat = -Infinity
    for (const [lng, lat] of route.coordinates) {
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
    if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 90, maxZoom: 15, duration: 800 },
    )
  }, [map, routes, activeIndex, fitKey])

  // ------------------------------------------------------------ destination pin
  useEffect(() => {
    if (!map) return
    const label = destination.label ?? 'Destination'
    if (!destMarkerRef.current) {
      const el = createMarkerElement('pin', { label, size: 36, selected: true })
      destElRef.current = el
      destMarkerRef.current = new Marker({ element: el })
        .setLngLat([destination.lng, destination.lat])
        .addTo(map)
    } else {
      destMarkerRef.current.setLngLat([destination.lng, destination.lat])
      destElRef.current?.setAttribute('title', label)
      destElRef.current?.setAttribute('aria-label', label)
    }
  }, [map, destination])

  // ------------------------------------------------------------ teardown
  useEffect(
    () => () => {
      const m = mapRef.current
      destMarkerRef.current?.remove()
      destMarkerRef.current = null
      destElRef.current = null
      if (!m) return
      for (const id of [LAYER_ACTIVE, LAYER_ACTIVE_CASING, LAYER_ALT]) {
        if (m.getLayer(id)) m.removeLayer(id)
      }
      if (m.getSource(SOURCE_ID)) m.removeSource(SOURCE_ID)
    },
    [],
  )

  return null
}
