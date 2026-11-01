// GET /api/external/geocode?q=…        — forward search (map search box)
// GET /api/external/geocode?lat=&lng=  — reverse geocode (location panel)
// Server-proxied Nominatim (OSM): custom UA, throttling and 24 h cache.
import { NextResponse } from 'next/server'
import { fetchWithCache } from '@/lib/api-cache'
import { geocode, reverseGeocode } from '@/lib/external/nominatim'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = url.searchParams.get('q')
  const lat = Number.parseFloat(url.searchParams.get('lat') ?? '')
  const lng = Number.parseFloat(url.searchParams.get('lng') ?? '')

  if (q && q.trim().length >= 2) {
    const result = await fetchWithCache({
      key: `geocode:${q.trim().toLowerCase()}`,
      ttl: 24 * 60 * 60_000,
      source: 'Nominatim (OpenStreetMap)',
      attribution: 'Geocoding © OpenStreetMap contributors, ODbL',
      fetcher: () => geocode(q.trim()),
    })
    return NextResponse.json(result)
  }

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const result = await fetchWithCache({
      key: `reverse:${lat.toFixed(4)}:${lng.toFixed(4)}`,
      ttl: 24 * 60 * 60_000,
      source: 'Nominatim (OpenStreetMap)',
      attribution: 'Geocoding © OpenStreetMap contributors, ODbL',
      fetcher: () => reverseGeocode(lat, lng),
    })
    return NextResponse.json(result)
  }

  return NextResponse.json(
    { error: 'Provide ?q= for search or ?lat=&lng= for reverse geocoding.' },
    { status: 400 },
  )
}
