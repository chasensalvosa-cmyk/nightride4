// GET /api/external/geocode?q=…                — forward search (map search box)
// GET /api/external/geocode?lat=&lng=           — reverse geocode (location panel)
// GET /api/external/geocode?q=…&lat=&lng=       — forward search biased to the
//                                                 rider's position: Nominatim
//                                                 (addresses, streets) POOLED
//                                                 with Photon (brand POIs —
//                                                 "smiths", "mcdonalds", …),
//                                                 deduped and sorted by real
//                                                 distance.
// Server-proxied (never from the browser) with caching.
import { NextResponse } from 'next/server'
import { fetchWithCache } from '@/lib/api-cache'
import { geocode, reverseGeocode } from '@/lib/external/nominatim'
import { photonSearch, type PoiMatch } from '@/lib/external/photon'
import type { GeocodeResult } from '@/types'

/** A POI-ish OSM key ranks above boundary/landuse matches. */
const POI_KEYS = new Set(['shop', 'amenity', 'tourism', 'leisure', 'office', 'healthcare', 'craft'])

function toGeocodeResult(p: PoiMatch): GeocodeResult {
  return {
    id: p.id,
    label: p.label,
    detail: p.detail,
    latitude: p.latitude,
    longitude: p.longitude,
    type: p.type,
    distanceMeters: p.distanceMeters,
  }
}

/** Merge Nominatim + Photon matches: drop near-duplicates (same place within
 *  ~120 m), keep POIs ahead of street/boundary hits, sort by distance. */
function mergeResults(
  nominatim: GeocodeResult[],
  photon: PoiMatch[],
  limit: number,
): GeocodeResult[] {
  const merged: GeocodeResult[] = []
  const taken: { lat: number; lng: number }[] = []

  const isDuplicate = (lat: number, lng: number) =>
    taken.some((t) => Math.abs(t.lat - lat) < 0.0011 && Math.abs(t.lng - lng) < 0.0011)

  // Photon POIs first (brand/name matches are what riders search for), then
  // Nominatim for streets, addresses and places.
  for (const p of photon) {
    if (isDuplicate(p.latitude, p.longitude)) continue
    taken.push({ lat: p.latitude, lng: p.longitude })
    merged.push(toGeocodeResult(p))
  }
  for (const n of nominatim) {
    if (isDuplicate(n.latitude, n.longitude)) continue
    taken.push({ lat: n.latitude, lng: n.longitude })
    merged.push(n)
  }

  merged.sort((a, b) => {
    const ai = a.distanceMeters ?? Infinity
    const bi = b.distanceMeters ?? Infinity
    // Places whose distance is unknown (global search) keep provider order.
    if (!Number.isFinite(ai) && !Number.isFinite(bi)) return 0
    return ai - bi
  })
  return merged.slice(0, limit)
}

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
      source: hasNear ? 'Nominatim + Photon (OpenStreetMap)' : 'Nominatim (OpenStreetMap)',
      attribution: 'Geocoding © OpenStreetMap contributors, ODbL',
      fetcher: async (): Promise<GeocodeResult[]> => {
        if (!hasNear) return geocode(q.trim())
        // Both providers in parallel: one failing must not sink the search.
        const [nominatimRes, photonRes] = await Promise.allSettled([
          geocode(q.trim(), { lat, lng }),
          photonSearch(q.trim(), { lat, lng }),
        ])
        const nominatim = nominatimRes.status === 'fulfilled' ? nominatimRes.value : []
        const photon = photonRes.status === 'fulfilled' ? photonRes.value : []
        if (nominatim.length === 0 && photon.length === 0) {
          if (nominatimRes.status === 'rejected' && photonRes.status === 'rejected') {
            throw new Error('Geocoding providers unreachable.')
          }
          return [] // genuinely no matches — an honest empty result
        }
        return mergeResults(nominatim, photon, 12)
      },
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
