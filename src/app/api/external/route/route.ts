// GET /api/external/route?from=lat,lng&to=lat,lng — fastest routes between two
// points (OSRM, car profile): primary route plus up to 2 alternatives, sorted
// by travel time. Server-proxied with a 10 min cache; failures surface as an
// honest "unavailable" state — never invented geometry.

import { NextResponse } from 'next/server'
import { fetchWithCache } from '@/lib/api-cache'
import { fetchDrivingRoutes } from '@/lib/external/osrm'
import type { RouteOption } from '@/types'

function parsePoint(raw: string | null): { lat: number; lng: number } | null {
  if (!raw) return null
  const [latStr, lngStr] = raw.split(',')
  const lat = Number.parseFloat(latStr ?? '')
  const lng = Number.parseFloat(lngStr ?? '')
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const from = parsePoint(url.searchParams.get('from'))
  const to = parsePoint(url.searchParams.get('to'))

  if (!from || !to) {
    return NextResponse.json(
      { error: 'Provide ?from=lat,lng and ?to=lat,lng (decimal degrees).' },
      { status: 400 },
    )
  }
  if (Math.abs(from.lat - to.lat) < 1e-6 && Math.abs(from.lng - to.lng) < 1e-6) {
    return NextResponse.json({ error: 'Origin and destination are the same point.' }, { status: 400 })
  }

  // 4 dp (~10 m) keeps the cache effective while the GPS watcher drifts.
  const result = await fetchWithCache<RouteOption[]>({
    key: `osrm:${from.lat.toFixed(4)},${from.lng.toFixed(4)}→${to.lat.toFixed(4)},${to.lng.toFixed(4)}`,
    ttl: 10 * 60_000,
    source: 'OSRM (router.project-osrm.org)',
    attribution: 'Routing © OpenStreetMap contributors, ODbL — OSRM',
    fetcher: () => fetchDrivingRoutes(from, to),
  })
  return NextResponse.json(result)
}
