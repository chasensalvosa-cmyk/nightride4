// NIGHTRIDE — OpenSky Network service module.
// General air-traffic awareness ONLY: renders public ADS-B state vectors in
// aggregate. No law-enforcement identification, no callsign targeting, no
// following of privacy-restricted aircraft (see API_RESEARCH.md §2.1).

import { fetchJson } from './http'
import type { AircraftState } from '@/types'

const BASE_URL =
  process.env.AVIATION_PROVIDER_BASE_URL?.trim() || 'https://opensky-network.org/api'

export interface Bbox {
  minLat: number
  minLng: number
  maxLat: number
  maxLng: number
}

interface OpenSkyResponse {
  time: number
  states: unknown[][] | null
}

/**
 * Fetch live aircraft state vectors for a bounding box.
 * Anonymous access is rate limited (~400 credits/day): callers must go
 * through the TTL cache in the API route (10 s cache).
 */
export async function fetchAircraft(bbox: Bbox): Promise<AircraftState[]> {
  const url =
    `${BASE_URL}/states/all?lamin=${bbox.minLat.toFixed(4)}&lomin=${bbox.minLng.toFixed(4)}` +
    `&lamax=${bbox.maxLat.toFixed(4)}&lomax=${bbox.maxLng.toFixed(4)}`
  const headers: Record<string, string> = {
    'User-Agent': 'NIGHTRIDE/1.0 (e-moto platform)',
  }
  const data = await fetchJson<OpenSkyResponse>(url, {
    headers,
    timeoutMs: 8000,
    retries: 1,
  })
  if (!data.states) return []
  return data.states
    .map((s) => normalizeState(s))
    .filter((s): s is AircraftState => s !== null)
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function normalizeState(raw: unknown[]): AircraftState | null {
  const lat = num(raw[6])
  const lng = num(raw[5])
  if (lat === null || lng === null) return null
  const callsign =
    typeof raw[1] === 'string' && raw[1].trim().length > 0
      ? raw[1].trim()
      : null
  return {
    icao24: String(raw[0] ?? ''),
    callsign,
    originCountry: String(raw[2] ?? '—'),
    latitude: lat,
    longitude: lng,
    baroAltitude: num(raw[7]),
    geoAltitude: num(raw[13]),
    onGround: raw[8] === true,
    velocity: num(raw[9]),
    trueTrack: num(raw[10]),
    verticalRate: num(raw[11]),
    timePosition: num(raw[3]),
    lastContact: num(raw[4]),
  }
}

/** Real connectivity test used by /api/status. */
export async function pingOpenSky(): Promise<number> {
  const states = await fetchAircraft({
    minLat: 47.4,
    minLng: -122.5,
    maxLat: 47.8,
    maxLng: -122.2,
  })
  return states.length
}
