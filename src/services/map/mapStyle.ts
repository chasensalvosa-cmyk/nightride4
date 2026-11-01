// NIGHTRIDE — map service: basemap style resolution (Mapbox / OSM fallback).
// A public Mapbox token switches the basemap to real Mapbox dark-v11 raster
// tiles; without a token the keyless CARTO dark_all (OpenStreetMap) tiles
// are used. Both are rendered by MapLibre GL with identical controls.

import type { StyleSpecification } from 'maplibre-gl'

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() || ''

export function isMapboxConfigured(): boolean {
  return MAPBOX_TOKEN.length > 0
}

export interface BasemapInfo {
  id: 'mapbox' | 'osm'
  label: string
  attribution: string
}

export function activeBasemap(): BasemapInfo {
  return isMapboxConfigured()
    ? {
        id: 'mapbox',
        label: 'Mapbox dark-v11',
        attribution:
          '<a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noreferrer">© Mapbox</a> ' +
          '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>',
      }
    : {
        id: 'osm',
        label: 'OpenStreetMap · CARTO dark',
        attribution:
          '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> ' +
          '<a href="https://carto.com/attributions" target="_blank" rel="noreferrer">© CARTO</a>',
      }
}

const RASTER_SIZE = 512

/** Build the MapLibre style for the active basemap. */
export function buildMapStyle(): StyleSpecification {
  if (isMapboxConfigured()) {
    return {
      version: 8,
      sources: {
        basemap: {
          type: 'raster',
          tiles: [
            `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(MAPBOX_TOKEN)}`,
          ],
          tileSize: RASTER_SIZE,
          attribution: activeBasemap().attribution,
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
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        ],
        tileSize: RASTER_SIZE,
        attribution: activeBasemap().attribution,
        maxzoom: 20,
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
