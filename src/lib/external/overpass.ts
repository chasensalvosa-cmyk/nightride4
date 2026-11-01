// NIGHTRIDE — Overpass API service module (OpenStreetMap POI extraction).
// Used for real charging-station locations from OpenStreetMap.
// No key required. ODbL attribution mandatory.
//
// Mirror order notes (global-only mirrors — regional extracts like
// overpass.osm.ch return EMPTY results outside their region, which silently
// breaks the layer, so they are never used here):
//   1. overpass-api.de   — canonical, fast, global (rate-limited when busy)
//   2. maps.mail.ru      — VK Maps mirror, global, very reliable, slower
//   3. kumi.systems      — global, good spare

import { fetchJson } from './http'
import type { ChargingStation } from '@/types'

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

interface OverpassNode {
  type: string
  id: number
  lat: number
  lon: number
  tags?: Record<string, string>
}

interface OverpassResponse {
  elements: OverpassNode[]
}

export function chargingQuery(lat: number, lng: number, radiusM: number): string {
  return (
    `[out:json][timeout:10];` +
    `node[amenity=charging_station](around:${Math.round(radiusM)},${lat.toFixed(5)},${lng.toFixed(5)});` +
    `out body 200;`
  )
}

function normalize(el: OverpassNode): ChargingStation | null {
  const tags = el.tags ?? {}
  const sockets = Object.keys(tags)
    .filter((k) => k.startsWith('socket:') && tags[k] === 'yes')
    .map((k) => k.replace('socket:', '').replace(/_/g, ' ').toUpperCase())
    .slice(0, 4)
  return {
    id: `osm-${el.id}`,
    name: tags.name || tags.operator || 'Charging station',
    latitude: el.lat,
    longitude: el.lon,
    operator: tags.operator || null,
    capacity: tags.capacity ? Number.parseInt(tags.capacity, 10) || null : null,
    socketTypes: sockets,
    sourceUrl: `https://www.openstreetmap.org/node/${el.id}`,
  }
}

/** Fetch real OSM charging stations around a point (no invented coordinates). */
export async function fetchChargingStations(
  lat: number,
  lng: number,
  radiusM = 5000,
): Promise<ChargingStation[]> {
  const query = chargingQuery(lat, lng, radiusM)
  let lastError: Error = new Error('All Overpass mirrors unreachable')

  for (const mirror of MIRRORS) {
    try {
      const data = await fetchJson<OverpassResponse>(mirror, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'NIGHTRIDE/1.0 (e-moto platform)',
        },
        body: `data=${encodeURIComponent(query)}`,
        timeoutMs: 20000,
        retries: 0,
      })
      return (data.elements ?? [])
        .filter((el) => el.type === 'node' && typeof el.lat === 'number')
        .map((el) => normalize(el))
        .filter((c): c is ChargingStation => c !== null)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastError
}

/** Real connectivity test used by /api/status. */
export async function pingOverpass(): Promise<number> {
  const stations = await fetchChargingStations(47.6062, -122.3321, 1500)
  return stations.length
}
