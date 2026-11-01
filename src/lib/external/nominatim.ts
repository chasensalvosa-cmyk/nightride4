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
//
// Brand-name quirk: Nominatim matches literal names — "mcdonalds" finds
// nothing while "McDonald's" works, "smiths" returns a locality while
// "Smith's" returns the supermarkets. Queries without an apostrophe are
// automatically retried with one inserted before a trailing "s".

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

/** "mcdonalds" → "mcdonald's", "smiths" → "smith's"; null when the query
 *  already has an apostrophe or no trailing s to split. */
function apostropheVariant(query: string): string | null {
  if (query.includes("'")) return null
  const m = query.match(/^(.{2,}?[a-zA-Z])s$/)
  if (!m) return null
  return `${m[1]}'s`
}

/** One bounded search inside the rider's ±35 km box (no fallbacks).
 *  Nominatim ranks by relevance, not proximity — category browse passes a
 *  higher limit so the caller's distance sort has near candidates to find. */
export async function searchBounded(
  query: string,
  near: { lat: number; lng: number },
  limit = 8,
): Promise<GeocodeMatch[]> {
  const l = Math.min(Math.max(Math.trunc(limit), 1), 50)
  const base = `${BASE_URL}/search?q=${encodeURIComponent(query)}&format=json&limit=${l}&addressdetails=1`
  const b = bboxAround(near.lat, near.lng, 35000)
  const viewbox = `&viewbox=${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}`
  const places = await search(`${base}${viewbox}&bounded=1`)
  return toMatches(places)
}

export async function geocode(
  query: string,
  near?: { lat: number; lng: number },
): Promise<GeocodeMatch[]> {
  const base = `${BASE_URL}/search?q=${encodeURIComponent(query)}&format=json&limit=8&addressdetails=1`
  const variant = apostropheVariant(query)

  let places: NominatimPlace[] = []
  if (near) {
    const b = bboxAround(near.lat, near.lng, 35000)
    const viewbox = `&viewbox=${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}`
    places = await search(`${base}${viewbox}&bounded=1`)
    if (places.length === 0) {
      // Demote the box to a rank hint so obscure names still resolve —
      // honestly, further away.
      places = await search(`${base}${viewbox}&bounded=0`)
    }
    if (variant && places.length < 8) {
      // Brand punctuation pool: "smiths" alone can surface a *locality*
      // named Smiths; "Smith's" surfaces the supermarkets. Pool both.
      const variantPlaces = await search(
        `${BASE_URL}/search?q=${encodeURIComponent(variant)}&format=json&limit=8&addressdetails=1${viewbox}&bounded=1`,
      )
      places = dedupePlaces([...variantPlaces, ...places])
    }
  } else {
    places = await search(base)
    if (variant && places.length === 0) {
      places = await search(
        `${BASE_URL}/search?q=${encodeURIComponent(variant)}&format=json&limit=8&addressdetails=1`,
      )
    }
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

/** Same place from original + variant queries → keep one (prefer the first). */
function dedupePlaces(places: NominatimPlace[]): NominatimPlace[] {
  const seen = new Set<number>()
  return places.filter((p) => {
    if (seen.has(p.place_id)) return false
    seen.add(p.place_id)
    return true
  })
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
