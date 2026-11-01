// NIGHTRIDE — map service: basemap resolution (Mapbox → OpenFreeMap → Esri).
//
// Resolution order — every provider is real, nothing is ever faked:
//   1. Mapbox dark-v11 raster tiles — active when NEXT_PUBLIC_MAPBOX_TOKEN is set.
//   2. OpenFreeMap "dark" vector style — keyless, OSM-based, probed live before
//      the map boots (https://openfreemap.org, free for commercial use).
//   3. Esri World Dark Gray (Base + Reference) raster tiles — keyless emergency
//      fallback when OpenFreeMap cannot be reached.
//
// History: the previous keyless fallback used CARTO dark_all raster tiles
// (basemaps.cartocdn.com). CARTO now requires an API key for basemaps and
// serves watermarked "API KEY REQUIRED" images without one, so CARTO was
// removed from the chain. See API_RESEARCH.md §1.2 for the details.

import type { StyleSpecification } from 'maplibre-gl'

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() || ''

export function isMapboxConfigured(): boolean {
  return MAPBOX_TOKEN.length > 0
}

export type BasemapId = 'mapbox' | 'openfreemap' | 'esri'

export interface BasemapInfo {
  id: BasemapId
  label: string
  attribution: string
}

const OSM_ATTRIB =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>'

export const MAPBOX_INFO: BasemapInfo = {
  id: 'mapbox',
  label: 'Mapbox · dark-v11',
  attribution:
    '<a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noreferrer">© Mapbox</a> ' + OSM_ATTRIB,
}

export const OPENFREEMAP_INFO: BasemapInfo = {
  id: 'openfreemap',
  label: 'OpenFreeMap · dark (OSM)',
  attribution:
    OSM_ATTRIB + ' · <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>',
}

export const ESRI_INFO: BasemapInfo = {
  id: 'esri',
  label: 'Esri · World Dark Gray',
  attribution:
    '<a href="https://www.esri.com/legal/copyright-trademarks" target="_blank" rel="noreferrer">Tiles © Esri</a> — Source: Esri, Garmin, FAO, NOAA, USGS',
}

/** Keyless dark vector style served by OpenFreeMap (no API key required). */
export const OPENFREEMAP_DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'

/** Info for the basemap that will be attempted first (before probing). */
export function activeBasemap(): BasemapInfo {
  return isMapboxConfigured() ? MAPBOX_INFO : OPENFREEMAP_INFO
}

const RASTER_SIZE = 512

/** Mapbox dark-v11 raster style (requires NEXT_PUBLIC_MAPBOX_TOKEN). */
export function buildMapboxStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: [
          `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(MAPBOX_TOKEN)}`,
        ],
        tileSize: RASTER_SIZE,
        attribution: MAPBOX_INFO.attribution,
        maxzoom: 22,
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#090909' },
      },
      { id: 'basemap', type: 'raster', source: 'basemap' },
    ],
  }
}

/**
 * Esri World Dark Gray raster style — keyless emergency fallback.
 * The Base layer carries land/water masses, the transparent Reference layer
 * carries labels and boundaries (Esri's dark canvas deliberately has no roads).
 */
export function buildEsriDarkGrayStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      'esri-darkgray-base': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: ESRI_INFO.attribution,
        maxzoom: 18,
      },
      'esri-darkgray-reference': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 18,
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#0d0d0d' },
      },
      { id: 'esri-darkgray-base', type: 'raster', source: 'esri-darkgray-base' },
      { id: 'esri-darkgray-reference', type: 'raster', source: 'esri-darkgray-reference' },
    ],
  }
}

export interface ResolvedBasemap {
  style: StyleSpecification
  info: BasemapInfo
}

const OFM_PROBE_TIMEOUT_MS = 6000

/**
 * Probe the keyless OpenFreeMap dark style. Returns the parsed style with
 * proper OSM attribution injected (the published style carries none), or null
 * when unreachable — the caller then falls back to Esri raster tiles.
 */
async function probeOpenFreeMapStyle(): Promise<StyleSpecification | null> {
  try {
    const res = await fetch(OPENFREEMAP_DARK_STYLE_URL, {
      signal: AbortSignal.timeout(OFM_PROBE_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const style = (await res.json()) as StyleSpecification
    if (!style || !style.sources || !Array.isArray(style.layers) || style.layers.length === 0) {
      return null
    }
    // The published style has no per-source attribution — inject it so the
    // attribution control credits OpenStreetMap properly (duplicates merge).
    const sources = style.sources as Record<string, { attribution?: string }>
    for (const src of Object.values(sources)) {
      if (src && !src.attribution) src.attribution = OPENFREEMAP_INFO.attribution
    }
    return style
  } catch {
    return null
  }
}

/**
 * Resolve the style the map boots with. Mapbox wins when a token exists
 * (no probe needed); otherwise OpenFreeMap is probed live and Esri is the
 * guaranteed keyless last resort.
 */
export async function resolveMapStyle(): Promise<ResolvedBasemap> {
  if (isMapboxConfigured()) {
    return { style: buildMapboxStyle(), info: MAPBOX_INFO }
  }
  const ofm = await probeOpenFreeMapStyle()
  if (ofm) return { style: ofm, info: OPENFREEMAP_INFO }
  return { style: buildEsriDarkGrayStyle(), info: ESRI_INFO }
}
