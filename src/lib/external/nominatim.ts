// NIGHTRIDE — Nominatim (OpenStreetMap) geocoding service module.
// Server-proxied (never called from the browser) with the mandatory custom
// User-Agent, a >=1.1 s min-interval guard (usage policy: max 1 req/s) and
// long-lived response caching. Used for map search + reverse geocoding.
//
// Forward search supports a `near` bias: when the rider has a GPS fix the
// query is boxed to ~±35 km around them (bounded=1) so matches are the
// places closest to the rider, then sorted by real great-circle distance.
// If the strict box finds nothing, the same box demotes to a rank hint
// (bounded=0) so obscure names still resolve — honestly, further away.

import { fetchJson } from './http'
import { bboxAround, haversineMeters } from '@/lib/geo'

const BASE_URL = 'https://nominatim.openstreetmap.org'
const UA = 'NIGHTRIDE/1.0 (e-moto platform; map search)'

let lastRequestAt = 0
const MIN_INTERVAL_MS = 1100

async function throttle(): Promise<void> {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequestAt = Date.now()
}

interface NominatimPlace {
  place_id: number
  lat: string
  lon: string
  display_name: string
  name?: string
  type: string
  class: string
  address?: Record<string, string>
}

export interface GeocodeMatch {
  id: string
  label: string
  detail: string
  latitude: number
  longitude: number
  type: string
  /** meters from the `near` origin, present only for biased searches */
  distanceMeters?: number | null
}

async function search(url: string): Promise<NominatimPlace[]> {
  await throttle()
  const data = await fetchJson<NominatimPlace[]>(url, {
    headers: { 'User-Agent': UA },
    timeoutMs: 8000,
    retries: 1,
  })
  return data ?? []
}

function toMatches(places: NominatimPlace[]): GeocodeMatch[] {
  return places
    .map((p) => {
      const lat = Number.parseFloat(p.lat)
      const lng = Number.parseFloat(p.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
      const parts = p.display_name.split(',').map((s) => s.trim())
      return {
        id: `nom-${p.place_id}`,
        label: p.name || parts[0] || p.display_name,
        detail: parts.slice(1, 4).join(', '),
        latitude: lat,
        longitude: lng,
        type: p.type,
      } satisfies GeocodeMatch
    })
    .filter((r): r is GeocodeMatch => r !== null)
}

export async function geocode(
  query: string,
  near?: { lat: number; lng: number },
): Promise<GeocodeMatch[]> {
  const base = `${BASE_URL}/search?q=${encodeURIComponent(query)}&format=json&limit=8&addressdetails=1`

  let places: NominatimPlace[]
  if (near) {
    const b = bboxAround(near.lat, near.lng, 35000)
    const viewbox = `&viewbox=${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}`
    places = await search(`${base}${viewbox}&bounded=1`)
    if (places.length === 0) {
      places = await search(`${base}${viewbox}&bounded=0`)
    }
  } else {
    places = await search(base)
  }

  const matches = toMatches(places)
  if (near) {
    for (const m of matches) {
      m.distanceMeters = haversineMeters(near.lat, near.lng, m.latitude, m.longitude)
    }
    matches.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
  }
  return matches
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ label: string; detail: string } | null> {
  await throttle()
  const data = await fetchJson<NominatimPlace & { error?: string }>(
    `${BASE_URL}/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=16`,
    { headers: { 'User-Agent': UA }, timeoutMs: 8000, retries: 1 },
  )
  if (!data || data.error || !data.display_name) return null
  const parts = data.display_name.split(',').map((s) => s.trim())
  if (parts.length === 0) return null
  return {
    label: data.name || parts[0],
    detail: parts.slice(1, 4).join(', '),
  }
}
