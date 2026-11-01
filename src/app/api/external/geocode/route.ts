// GET /api/external/geocode?q=…                — forward search (map search box)
// GET /api/external/geocode?lat=&lng=           — reverse geocode (location panel)
// GET /api/external/geocode?q=…&lat=&lng=       — forward search biased to the
//                                                 rider's position: boxed to
//                                                 ±35 km, sorted by distance.
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
    const hasNear = Number.isFinite(lat) && Number.isFinite(lng)
    // 3 dp (~110 m) granularity keeps the cache effective while the GPS
    // watcher drifts a few meters between searches.
    const nearKey = hasNear ? `${lat.toFixed(3)},${lng.toFixed(3)}` : ''
    const result = await fetchWithCache({
      key: `geocode:${q.trim().toLowerCase()}${nearKey ? `@${nearKey}` : ''}`,
      ttl: 24 * 60 * 60_000,
      source: 'Nominatim (OpenStreetMap)',
      attribution: 'Geocoding © OpenStreetMap contributors, ODbL',
      fetcher: () => geocode(q.trim(), hasNear ? { lat, lng } : undefined),
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
