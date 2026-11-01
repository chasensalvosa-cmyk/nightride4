// GET /api/external/pois?lat=&lng=&category=food|coffee|groceries|fuel|atm|hotel
// One-tap nearby category browse for the map search chips. Merges Nominatim
// category words (always reachable) with a Photon brand-term fan-out
// (best-effort), dedupes the real OSM POIs, caps them to riding distance
// (~30 km) and sorts them nearest-first. Cached 6 h server-side (POIs change
// slowly) — empty results are returned live but NOT cached, so a temporary
// provider outage never freezes a "no results" answer for hours.
import { NextResponse } from 'next/server'
import { fetchWithCache } from '@/lib/api-cache'
import { browseNearbyCategory } from '@/lib/external/nearbyPois'
import { POI_CATEGORIES, type PoiCategory } from '@/lib/external/photon'
import type { GeocodeResult } from '@/types'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const lat = Number.parseFloat(url.searchParams.get('lat') ?? '')
  const lng = Number.parseFloat(url.searchParams.get('lng') ?? '')
  const category = url.searchParams.get('category') ?? ''

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: 'Provide ?lat=&lng= (your position) and &category=.' },
      { status: 400 },
    )
  }
  if (!(category in POI_CATEGORIES)) {
    return NextResponse.json(
      { error: `Unknown category. Available: ${Object.keys(POI_CATEGORIES).join(', ')}.` },
      { status: 400 },
    )
  }

  // ~110 m cache granularity: the GPS dot drifting must not thrash providers.
  const result = await fetchWithCache({
    key: `pois:${category}@${lat.toFixed(3)},${lng.toFixed(3)}`,
    ttl: 6 * 60 * 60_000,
    source: 'Nominatim + Photon (OpenStreetMap)',
    attribution: 'Geocoding © OpenStreetMap contributors, ODbL',
    fetcher: async (): Promise<GeocodeResult[]> => {
      const pois = await browseNearbyCategory(category as PoiCategory, { lat, lng })
      if (pois.length === 0) {
        // Throwing keeps the empty answer OUT of the long-lived cache.
        throw new Error('NO_RESULTS')
      }
      return pois.map(({ engine: _engine, ...r }) => r)
    },
  })

  if (result.freshness === 'unavailable' && result.note === 'NO_RESULTS') {
    return NextResponse.json({
      data: [],
      freshness: 'live',
      fetchedAt: new Date().toISOString(),
      source: result.source,
      attribution: result.attribution,
    })
  }

  return NextResponse.json(result)
}
