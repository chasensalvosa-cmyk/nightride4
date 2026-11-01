// GET /api/external/aviation?minLat&minLng&maxLat&maxLng
// Server-proxied OpenSky Network feed (general air-traffic awareness).
// 10 s cache: anonymous OpenSky resolution is ~10 s and rate limited.
import { NextResponse } from 'next/server'
import { fetchWithCache } from '@/lib/api-cache'
import { fetchAircraft } from '@/lib/external/opensky'
import type { AircraftState } from '@/types'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const minLat = Number.parseFloat(url.searchParams.get('minLat') ?? '')
  const minLng = Number.parseFloat(url.searchParams.get('minLng') ?? '')
  const maxLat = Number.parseFloat(url.searchParams.get('maxLat') ?? '')
  const maxLng = Number.parseFloat(url.searchParams.get('maxLng') ?? '')

  if (![minLat, minLng, maxLat, maxLng].every(Number.isFinite)) {
    return NextResponse.json(
      { error: 'Bounding box parameters minLat/minLng/maxLat/maxLng are required.' },
      { status: 400 },
    )
  }
  if (maxLat - minLat > 8 || maxLng - minLng > 14) {
    return NextResponse.json(
      { error: 'Bounding box too large — zoom in to load air traffic.' },
      { status: 400 },
    )
  }

  const result = await fetchWithCache<AircraftState[]>({
    key: `aviation:${minLat.toFixed(1)}:${minLng.toFixed(1)}:${maxLat.toFixed(1)}:${maxLng.toFixed(1)}`,
    ttl: 10_000,
    source: 'OpenSky Network',
    attribution: 'Data © OpenSky Network — general air-traffic awareness',
    fetcher: () =>
      fetchAircraft({ minLat, minLng, maxLat, maxLng }),
  })

  return NextResponse.json(result)
}
