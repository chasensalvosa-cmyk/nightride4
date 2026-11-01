// GET /api/external/charging?lat&lng&radius
// Server-proxied Overpass (OpenStreetMap) charging station lookup.
// 10-minute cache; queries are rounded to reduce provider load.
import { NextResponse } from 'next/server'
import { fetchWithCache } from '@/lib/api-cache'
import { fetchChargingStations } from '@/lib/external/overpass'
import type { ChargingStation } from '@/types'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const lat = Number.parseFloat(url.searchParams.get('lat') ?? '')
  const lng = Number.parseFloat(url.searchParams.get('lng') ?? '')
  const radius = Math.min(
    Math.max(Number.parseFloat(url.searchParams.get('radius') ?? '6000'), 500),
    20000,
  )
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: 'Parameters lat and lng are required.' },
      { status: 400 },
    )
  }

  const result = await fetchWithCache<ChargingStation[]>({
    key: `charging:${lat.toFixed(2)}:${lng.toFixed(2)}:${Math.round(radius / 1000)}`,
    ttl: 10 * 60_000,
    source: 'OpenStreetMap (Overpass API)',
    attribution: 'Charging stations © OpenStreetMap contributors, ODbL',
    fetcher: () => fetchChargingStations(lat, lng, radius),
  })

  return NextResponse.json(result)
}
