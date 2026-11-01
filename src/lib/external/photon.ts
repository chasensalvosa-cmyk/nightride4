// NIGHTRIDE — Photon (komoot) geocoding service module.
// Server-proxied, keyless. Photon is POI/brand-search focused (unlike
// Nominatim's address bias): "smiths" finds Smith's supermarkets, "mcdonalds"
// finds McDonald's restaurants. Text searches are biased to the rider's
// position with a bbox + lat/lon priority, then re-sorted by real distance.
//
// Category browse ("food near me") uses a parallel brand-term fan-out:
// Photon matches on names, so each category fires its highest-signal terms
// simultaneously and pools the deduped, distance-sorted POIs. All results
// are real OSM POIs — the term list only improves recall, it never invents
// places. Public instance usage policy: modest rate, descriptive User-Agent.

import { fetchJson } from './http'
import { bboxAround, haversineMeters } from '@/lib/geo'

const BASE_URL = 'https://photon.komoot.io/api'
const UA = 'NIGHTRIDE/1.0 (e-moto platform; map search)'
/** keep chip results inside a realistic ride-to distance (~20 min) */
const MAX_POI_DISTANCE_M = 30000

interface PhotonFeature {
  geometry: { coordinates: [number, number] } // [lon, lat]
  properties: {
    osm_id?: number
    osm_type?: string
    osm_key?: string // e.g. shop, amenity, tourism
    osm_value?: string // e.g. supermarket, fast_food
    name?: string
    housenumber?: string
    street?: string
    city?: string
    county?: string
    state?: string
  }
}

interface PhotonResponse {
  features: PhotonFeature[]
}

export interface PoiMatch {
  id: string
  label: string
  detail: string
  latitude: number
  longitude: number
  type: string
  /** OSM top-level key (shop/amenity/…) — lets callers rank POIs */
  osmKey: string
  osmValue: string
  distanceMeters: number | null
}

function toDetail(p: PhotonFeature['properties']): string {
  return [p.street && p.housenumber ? `${p.housenumber} ${p.street}` : p.street, p.city ?? p.county, p.state]
    .filter((s): s is string => !!s && s.length > 0)
    .slice(0, 3)
    .join(', ')
}

interface PhotonRow {
  f: PhotonFeature
  lat: number | undefined
  lng: number | undefined
}

async function photonQuery(
  params: URLSearchParams,
  timeoutMs = 8000,
): Promise<PhotonRow[]> {
  const data = await fetchJson<PhotonResponse>(`${BASE_URL}?${params.toString()}`, {
    headers: { 'User-Agent': UA },
    timeoutMs,
    retries: 1,
  })
  return (data.features ?? []).map((f) => ({
    f,
    lat: f.geometry?.coordinates?.[1],
    lng: f.geometry?.coordinates?.[0],
  }))
}

/** Full-text POI/address search biased to the rider's position (±35 km box). */
export async function photonSearch(
  query: string,
  near: { lat: number; lng: number },
): Promise<PoiMatch[]> {
  const b = bboxAround(near.lat, near.lng, 35000)
  // Photon bbox order: minLon,minLat,maxLon,maxLat
  const bbox = `${b.minLng.toFixed(4)},${b.minLat.toFixed(4)},${b.maxLng.toFixed(4)},${b.maxLat.toFixed(4)}`
  const params = new URLSearchParams({
    q: query,
    limit: '12',
    lat: near.lat.toFixed(5),
    lon: near.lng.toFixed(5),
    bbox,
  })

  const rows = await photonQuery(params)
  return rows
    .map(({ f, lat, lng }): PoiMatch | null => {
      if (typeof lat !== 'number' || typeof lng !== 'number') return null
      const p = f.properties ?? {}
      if (!p.osm_id) return null
      return {
        id: `ph-${p.osm_type ?? 'n'}${p.osm_id}`,
        label: p.name || p.street || p.city || 'Unnamed place',
        detail: toDetail(p),
        latitude: lat,
        longitude: lng,
        type: p.osm_value ?? p.osm_key ?? 'poi',
        osmKey: p.osm_key ?? '',
        osmValue: p.osm_value ?? '',
        distanceMeters: haversineMeters(near.lat, near.lng, lat, lng),
      }
    })
    .filter((r): r is PoiMatch => r !== null)
}

// ---------------------------------------------------------------- category browse

export type PoiCategory = 'food' | 'coffee' | 'groceries' | 'fuel' | 'atm' | 'hotel'

interface CategoryPreset {
  /** Photon osm_tag filters (key:value), OR-combined */
  tags: string[]
  /** high-recall brand/generic terms fanned out in parallel */
  terms: string[]
}

export const POI_CATEGORIES: Record<PoiCategory, CategoryPreset> = {
  food: {
    tags: ['amenity:fast_food', 'amenity:restaurant', 'amenity:cafe', 'cuisine'],
    terms: [
      'mcdonald', 'subway', 'taco', 'burger', 'pizza', 'restaurant', 'wendys', 'kfc',
      'sushi', 'domino', 'chipotle', 'chick', 'arby', 'dairy', 'cafe', 'grill', 'kitchen',
    ],
  },
  coffee: {
    tags: ['amenity:cafe'],
    terms: ['coffee', 'starbucks', 'espresso', 'dunkin', 'dutch bros', 'cafe', 'roast', 'latte', 'mocha', 'bean', 'brew'],
  },
  groceries: {
    tags: ['shop:supermarket', 'shop:convenience', 'shop:grocery', 'shop:department_store'],
    terms: [
      'grocery', 'supermarket', 'smiths', 'walmart', 'aldi', 'market', 'store', 'food',
      'kroger', 'safeway', 'costco', 'trader', 'harmons', 'macey', 'winco', 'sprouts',
    ],
  },
  fuel: {
    tags: ['amenity:fuel'],
    terms: [
      'gas', 'shell', 'chevron', 'exxon', 'marathon', 'fuel', 'petrol', 'bp', 'arco',
      'texaco', 'valero', 'sinclair', 'circle k', '7-eleven', 'quick', 'speedway',
    ],
  },
  atm: {
    tags: ['amenity:atm', 'amenity:bank'],
    terms: ['atm', 'bank', 'credit union', 'wells fargo', 'chase', 'zions', 'us bank'],
  },
  hotel: {
    tags: ['tourism:hotel', 'tourism:motel', 'tourism:guest_house'],
    terms: ['hotel', 'inn', 'motel', 'suites', 'marriott', 'hilton', 'best western', 'holiday', 'hampton', 'comfort'],
  },
}

/**
 * Category browse near the rider: fans the preset's terms out to Photon in
 * parallel, pools + dedupes the matches and keeps real POIs within riding
 * distance, sorted nearest-first.
 */
export async function browseCategoryPois(
  category: PoiCategory,
  near: { lat: number; lng: number },
): Promise<PoiMatch[]> {
  const preset = POI_CATEGORIES[category]
  if (!preset) return []

  const pooled = await Promise.all(
    preset.terms.map(async (term) => {
      const params = new URLSearchParams({
        q: term,
        limit: '10',
        lat: near.lat.toFixed(5),
        lon: near.lng.toFixed(5),
      })
      for (const t of preset.tags) params.append('osm_tag', t)
      try {
        return await photonQuery(params, 9000)
      } catch {
        return [] // one term failing must not sink the category
      }
    }),
  )

  const byId = new Map<string, PoiMatch>()
  for (const rows of pooled) {
    for (const { f, lat, lng } of rows) {
      if (typeof lat !== 'number' || typeof lng !== 'number') continue
      const p = f.properties ?? {}
      if (!p.osm_id || !p.name) continue
      const id = `ph-${p.osm_type ?? 'n'}${p.osm_id}`
      if (byId.has(id)) continue
      const distance = haversineMeters(near.lat, near.lng, lat, lng)
      if (distance > MAX_POI_DISTANCE_M) continue
      byId.set(id, {
        id,
        label: p.name,
        detail: toDetail(p),
        latitude: lat,
        longitude: lng,
        type: p.osm_value ?? p.osm_key ?? 'poi',
        osmKey: p.osm_key ?? '',
        osmValue: p.osm_value ?? '',
        distanceMeters: distance,
      })
    }
  }

  return [...byId.values()]
    .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))
    .slice(0, 20)
}
