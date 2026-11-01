// NIGHTRIDE — server-side TTL cache with honesty-first freshness tracking.
// Freshness is derived from the REAL age of the last successful response:
//   live       age <= ttl
//   delayed    age <= 3 × ttl
//   stale      older cached data still being served (provider failing)
//   unavailable no data and no successful response

import type { FreshData, Freshness } from '@/types'

interface CacheEntry<T> {
  data: T
  storedAt: number
  ttl: number
  source: string
  attribution: string
}

const store = new Map<string, CacheEntry<unknown>>()

function classify(ageMs: number, ttl: number): Freshness {
  if (ageMs <= ttl) return 'live'
  if (ageMs <= ttl * 3) return 'delayed'
  return 'stale'
}

export async function fetchWithCache<T>(opts: {
  key: string
  ttl: number
  source: string
  attribution: string
  fetcher: () => Promise<T>
}): Promise<FreshData<T>> {
  const cached = store.get(opts.key) as CacheEntry<T> | undefined
  const age = cached ? Date.now() - cached.storedAt : Infinity

  // Serve fresh-enough data without hitting the provider (rate-limit friendliness).
  if (cached && age <= opts.ttl) {
    return {
      data: cached.data,
      freshness: 'live',
      fetchedAt: new Date(cached.storedAt).toISOString(),
      source: cached.source,
      attribution: cached.attribution,
    }
  }

  try {
    const data = await opts.fetcher()
    const storedAt = Date.now()
    store.set(opts.key, {
      data,
      storedAt,
      ttl: opts.ttl,
      source: opts.source,
      attribution: opts.attribution,
    })
    return {
      data,
      freshness: 'live',
      fetchedAt: new Date(storedAt).toISOString(),
      source: opts.source,
      attribution: opts.attribution,
    }
  } catch (err) {
    // Provider failing: keep serving clearly-labelled stale data if we have it.
    if (cached) {
      return {
        data: cached.data,
        freshness: classify(age, opts.ttl),
        fetchedAt: new Date(cached.storedAt).toISOString(),
        source: cached.source,
        attribution: cached.attribution,
        note: `Provider currently unreachable — showing last known data (${(age / 1000) | 0}s old).`,
      }
    }
    return {
      data: null,
      freshness: 'unavailable',
      fetchedAt: null,
      source: opts.source,
      attribution: opts.attribution,
      note: err instanceof Error ? err.message : 'Provider unavailable.',
    }
  }
}

/** Read the last cached value without refetching (used by /api/status). */
export function peekCache<T>(key: string): { data: T; storedAt: number } | null {
  const cached = store.get(key) as CacheEntry<T> | undefined
  if (!cached) return null
  return { data: cached.data, storedAt: cached.storedAt }
}

export function cacheSize(): number {
  return store.size
}
