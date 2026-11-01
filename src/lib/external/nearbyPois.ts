// NIGHTRIDE — nearby category browse ("food near me", "groceries", …).
// Two real-data engines, merged:
//   1. Nominatim words — always reachable, serialized through the module's
//      >=1.1 s throttle (usage policy). Category words ("restaurant", "gas
//      station") plus brand words ("McDonald's", "Smith's"…) inside the
//      rider's ±35 km box: Nominatim ranks category words by relevance, not
//      proximity, which can skip the McDonald's 400 m away while listing an
//      Arby's 3 km out — the brand words close that recall gap even when
//      engine 2 is unreachable.
//   2. Photon brand-term fan-out — brand-diverse results (McDonald's, Dutch
//      Bros, Smith's…), best-effort: when Photon is unreachable the
//      Nominatim words carry the category alone.
// Results are pooled, deduped by name+proximity, capped to riding distance
// (~30 km) and sorted nearest-first. No invented places, ever.

import { haversineMeters } from '@/lib/geo'
import { searchBounded, type GeocodeMatch } from './nominatim'
import { browseCategoryPois, POI_CATEGORIES, type PoiCategory } from './photon'
import type { GeocodeResult } from '@/types'

const MAX_POI_DISTANCE_M = 30000
const MAX_RESULTS = 20

/** Category → Nominatim category words (verified: these return real POIs). */
const CATEGORY_WORDS: Record<PoiCategory, string[]> = {
  food: ['restaurant', 'fast food'],
  coffee: ['cafe'],
  groceries: ['supermarket', 'convenience store'],
  fuel: ['gas station', 'fuel'],
  atm: ['atm', 'bank'],
  hotel: ['hotel', 'motel'],
}

/** Category → Nominatim brand words. Literal names with the apostrophe
 *  included ("mcdonalds" finds nothing, "McDonald's" works — searchBounded
 *  does not do the apostrophe-variant retry). Few, high-signal terms only:
 *  each costs one serialized throttled request (~1.1 s) on a cache miss. */
const BRAND_WORDS: Record<PoiCategory, string[]> = {
  food: ["McDonald's", 'Taco Bell', 'Subway'],
  coffee: ['Starbucks', 'Dutch Bros'],
  groceries: ["Smith's", 'Walmart'],
  fuel: ['Chevron', 'Shell'],
  atm: [],
  hotel: [],
}

/** OSM type values (Nominatim `type` / Photon `osm_value`) that belong to
 *  each category — keyword search drift (an arts centre matching "bank")
 *  is dropped instead of shown as a fake nearby result. */
const CATEGORY_TYPES: Record<PoiCategory, Set<string>> = {
  food: new Set([
    'restaurant', 'fast_food', 'cafe', 'food_court', 'pub', 'bar', 'ice_cream', 'bakery',
  ]),
  coffee: new Set(['cafe', 'coffee_shop', 'espresso_bar', 'ice_cream']),
  groceries: new Set([
    'supermarket', 'convenience', 'grocery', 'groceries', 'department_store', 'marketplace', 'greengrocer', 'deli',
  ]),
  fuel: new Set(['fuel', 'charging_station']),
  atm: new Set(['atm', 'bank', 'credit_union', 'savings_bank']),
  hotel: new Set(['hotel', 'motel', 'guest_house', 'hostel', 'apartment']),
}

export interface NearbyResult extends GeocodeResult {
  /** which engine found the place (provenance for debugging, not shown) */
  engine: 'nominatim' | 'photon'
}

export async function browseNearbyCategory(
  category: PoiCategory,
  near: { lat: number; lng: number },
): Promise<NearbyResult[]> {
  const words = CATEGORY_WORDS[category] ?? []
  const brands = BRAND_WORDS[category] ?? []
  const preset = POI_CATEGORIES[category]

  // Both engines in parallel; each degrades independently.
  const [nominatimRes, photonRes] = await Promise.allSettled([
    (async (): Promise<GeocodeMatch[]> => {
      const pooled: GeocodeMatch[] = []
      for (const w of words) {
        // Higher limit: Nominatim ranks by relevance, so the pool needs
        // enough candidates for the distance sort to surface the near ones.
        // Serialized inside searchBounded by the Nominatim throttle.
        pooled.push(...(await searchBounded(w, near, 30)))
      }
      // Brand words run after the category words (same throttle queue) and
      // close the chain-recall gap: nearest McDonald's / Smith's / Starbucks
      // reliably appear even when the category word's relevance ranking
      // skipped them. A smaller limit — brands have few branches in range.
      for (const b of brands) {
        pooled.push(...(await searchBounded(b, near, 12)))
      }
      return pooled
    })(),
    preset ? browseCategoryPois(category, near) : Promise.resolve([]),
  ])

  const nominatim =
    nominatimRes.status === 'fulfilled' ? nominatimRes.value : []
  const photon = photonRes.status === 'fulfilled' ? photonRes.value : []

  if (nominatim.length === 0 && photon.length === 0) {
    if (nominatimRes.status === 'rejected' && photonRes.status === 'rejected') {
      throw new Error('Nearby search providers unreachable.')
    }
    return [] // genuinely nothing nearby — honest empty
  }

  const byId = new Map<string, NearbyResult>()
  const taken: { lat: number; lng: number }[] = []
  const isDuplicate = (lat: number, lng: number) =>
    taken.some((t) => Math.abs(t.lat - lat) < 0.0009 && Math.abs(t.lng - lng) < 0.0009)

  const push = (
    r: { id: string; label: string; detail: string; latitude: number; longitude: number; type: string },
    distance: number,
    engine: 'nominatim' | 'photon',
  ) => {
    // Keyword drift guard: only keep places whose OSM type actually belongs
    // to the requested category.
    if (!CATEGORY_TYPES[category]?.has(r.type)) return
    if (distance > MAX_POI_DISTANCE_M) return
    if (isDuplicate(r.latitude, r.longitude)) return
    taken.push({ lat: r.latitude, lng: r.longitude })
    byId.set(`${engine}-${r.id}`, {
      id: r.id,
      label: r.label,
      detail: r.detail,
      latitude: r.latitude,
      longitude: r.longitude,
      type: r.type,
      distanceMeters: Math.round(distance),
      engine,
    })
  }

  for (const n of nominatim) {
    push(n, haversineMeters(near.lat, near.lng, n.latitude, n.longitude), 'nominatim')
  }
  for (const p of photon) {
    push(p, p.distanceMeters ?? haversineMeters(near.lat, near.lng, p.latitude, p.longitude), 'photon')
  }

  return [...byId.values()]
    .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))
    .slice(0, MAX_RESULTS)
}
