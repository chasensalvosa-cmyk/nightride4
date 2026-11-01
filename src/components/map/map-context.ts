'use client'

// NIGHTRIDE — map engine context: exposes the live MapLibre instance to
// controls (zoom, recenter, fly-to) without prop drilling.

import { createContext, useContext } from 'react'
import type { Map as MLMap } from 'maplibre-gl'
import type { MapViewState } from '@/types'

export interface MapApi {
  getMap: () => MLMap | null
  zoomIn: () => void
  zoomOut: () => void
  flyTo: (view: Partial<MapViewState>, options?: { duration?: number }) => void
  fitBounds: (bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number }, padding?: number) => void
}

export const MapContext = createContext<MapApi | null>(null)

export function useMapApi(): MapApi | null {
  return useContext(MapContext)
}
