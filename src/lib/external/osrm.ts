// NIGHTRIDE — OSRM routing service module (server-proxied, keyless).
// Uses the public OSRM demo server by default (car profile, OSM road data).
// It is a free demonstration service with no SLA — every failure surfaces as
// an honest "unavailable" state, never as guessed data.
// OSRM_BASE_URL can repoint the app at a self-hosted instance in production.

import { fetchJson } from './http'

const BASE_URL = (process.env.OSRM_BASE_URL ?? 'https://router.project-osrm.org').replace(/\/+$/, '')
const UA = 'NIGHTRIDE/1.0 (e-moto platform; route planning)'

import type { RouteOption } from '@/types'

interface OsrmRoute {
  distance: number
  duration: number
  geometry?: { coordinates: [number, number][] }
}

interface OsrmResponse {
  code: string
  message?: string
  routes?: OsrmRoute[]
}

/**
 * Fastest driving routes between two points, including up to 2 alternatives,
 * sorted by travel time (index 0 = fastest). Distances in meters, durations in
 * seconds, geometry as GeoJSON [lng, lat] pairs.
 */
export async function fetchDrivingRoutes(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<RouteOption[]> {
  const url =
    `${BASE_URL}/route/v1/driving/` +
    `${from.lng.toFixed(6)},${from.lat.toFixed(6)};${to.lng.toFixed(6)},${to.lat.toFixed(6)}` +
    `?overview=full&geometries=geojson&alternatives=2&steps=false`

  const data = await fetchJson<OsrmResponse>(url, {
    headers: { 'User-Agent': UA },
    timeoutMs: 9000,
    // The public demo server occasionally resets fresh connections (observed:
    // first call after an idle gap fails, immediate retries succeed) — so
    // route requests get a wider retry budget than other providers.
    retries: 2,
    retryDelayMs: 900,
  })

  if (!data || data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(data?.message ?? 'No route found between those points.')
  }

  const routes: RouteOption[] = []
  for (const r of data.routes) {
    if (!Number.isFinite(r.distance) || !Number.isFinite(r.duration)) continue
    const coords = (r.geometry?.coordinates ?? []).filter(
      (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]),
    )
    if (coords.length < 2) continue
    routes.push({
      distanceMeters: r.distance,
      durationSeconds: r.duration,
      coordinates: coords as [number, number][],
    })
  }
  if (routes.length === 0) throw new Error('Routing service returned an empty path.')
  routes.sort((a, b) => a.durationSeconds - b.durationSeconds)
  return routes
}
