// NIGHTRIDE — map state store (Zustand, persisted to localStorage).
// Keeps the map view + layer toggles stable across navigation so the map
// "keeps state when switching between panels" as the spec requires.
// The active basemap info lives here too (NOT persisted — it is resolved
// live on every map boot so a removed Mapbox token never leaves a stale label).

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { activeBasemap, type BasemapInfo } from '@/services/map/mapStyle'
import type { MapLayerId, MapViewState } from '@/types'

export const DEFAULT_VIEW: MapViewState = {
  lat: 47.6062,
  lng: -122.3321,
  zoom: 12,
}

const ALL_LAYERS: MapLayerId[] = [
  'riders',
  'cameras',
  'road_hazards',
  'road_closures',
  'charging',
  'riding_areas',
  'aviation',
  'police_activity',
]

interface MapState {
  view: MapViewState
  layers: Record<MapLayerId, boolean>
  basemap: BasemapInfo
  setView: (view: Partial<MapViewState>) => void
  toggleLayer: (id: MapLayerId) => void
  setLayer: (id: MapLayerId, visible: boolean) => void
  setBasemap: (info: BasemapInfo) => void
}

export const useMapStore = create<MapState>()(
  persist(
    (set) => ({
      view: DEFAULT_VIEW,
      layers: {
        riders: false, // presence is consent-gated; off by default
        cameras: false, // ALPR/traffic inventory; off by default (dense in some areas)
        road_hazards: true,
        road_closures: true,
        charging: true,
        riding_areas: false,
        aviation: false,
        police_activity: true, // community sightings; auto-expire after 2 h
      },
      basemap: activeBasemap(),
      setView: (view) =>
        set((s) => ({ view: { ...s.view, ...view } })),
      toggleLayer: (id) =>
        set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),
      setLayer: (id, visible) =>
        set((s) => ({ layers: { ...s.layers, [id]: visible } })),
      setBasemap: (info) => set({ basemap: info }),
    }),
    {
      name: 'nightride-map',
      // Persist only the durable UI state — basemap is re-resolved each boot.
      partialize: (s) => ({ view: s.view, layers: s.layers }) as unknown as MapState,
      // Merge persisted state over defaults key-by-key so sessions saved BEFORE
      // a new layer id shipped still pick the new layer's default visibility.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<MapState>
        return {
          ...current,
          ...p,
          view: { ...current.view, ...(p.view ?? {}) },
          layers: { ...current.layers, ...(p.layers ?? {}) },
        } as MapState
      },
    },
  ),
)

export { ALL_LAYERS }
