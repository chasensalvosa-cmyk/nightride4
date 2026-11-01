// NIGHTRIDE — Nominatim (OpenStreetMap) geocoding service module.
// Server-proxied (never called from the browser) with the mandatory custom
// User-Agent, a >=1.1 s min-interval guard (usage policy: max 1 req/s) and
// long-lived response caching. Used for map search + reverse geocoding.

import { fetchJson } from './http'

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

export async function geocode(query: string): Promise<
  { id: string; label: string; detail: string; latitude: number; longitude: number; type: string }[]
> {
  await throttle()
  const data = await fetchJson<NominatimPlace[]>(
    `${BASE_URL}/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1`,
    { headers: { 'User-Agent': UA }, timeoutMs: 8000, retries: 1 },
  )
  return (data ?? [])
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
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
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
