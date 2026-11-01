'use client'

// NIGHTRIDE — map search (server-proxied Nominatim + Photon with debounce).
// When the rider has a GPS fix the search is biased to their area: matches
// are boxed to ±35 km, sorted by real distance and labelled "x away".
// One-tap category chips (Food, Coffee, Groceries, Fuel, ATM, Hotel) browse
// real nearby OSM POIs without typing.

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Banknote, BedDouble, Coffee, Fuel, Loader2, MapPin, Search, ShoppingCart, Utensils, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistance } from '@/lib/geo'
import { api } from '@/lib/api-client'
import type { FreshData, GeocodeResult } from '@/types'

const CATEGORY_CHIPS = [
  { id: 'food', label: 'Food', icon: Utensils },
  { id: 'coffee', label: 'Coffee', icon: Coffee },
  { id: 'groceries', label: 'Groceries', icon: ShoppingCart },
  { id: 'fuel', label: 'Fuel', icon: Fuel },
  { id: 'atm', label: 'ATM', icon: Banknote },
  { id: 'hotel', label: 'Hotel', icon: BedDouble },
] as const

export function MapSearch({
  onSelect,
  userLocation,
  className,
}: {
  onSelect: (result: GeocodeResult) => void
  /** live GPS fix — biases the search to the rider's area */
  userLocation?: { lat: number; lng: number } | null
  className?: string
}) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [focused, setFocused] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 450)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setFocused(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const nearKey = userLocation
    ? `${userLocation.lat.toFixed(3)},${userLocation.lng.toFixed(3)}`
    : null

  // Text search — Nominatim (addresses/streets) + Photon (brand POIs) merged
  // server-side, sorted by real distance from the rider.
  const textQuery = useQuery({
    queryKey: ['geocode', debounced, nearKey ?? 'global'],
    queryFn: () =>
      api.get<FreshData<GeocodeResult[]>>(
        `/api/external/geocode?q=${encodeURIComponent(debounced)}${
          userLocation
            ? `&lat=${userLocation.lat.toFixed(5)}&lng=${userLocation.lng.toFixed(5)}`
            : ''
        }`,
      ),
    enabled: debounced.length >= 2 && activeCategory === null,
    staleTime: 60_000,
  })

  // Category chip — real OSM POIs near the rider (Photon brand-term fan-out).
  const categoryQuery = useQuery({
    queryKey: ['pois', activeCategory, nearKey ?? 'none'],
    queryFn: () =>
      api.get<FreshData<GeocodeResult[]>>(
        `/api/external/pois?lat=${userLocation!.lat.toFixed(5)}&lng=${userLocation!.lng.toFixed(5)}&category=${activeCategory}`,
      ),
    enabled: activeCategory !== null && !!userLocation,
    staleTime: 10 * 60_000,
  })

  const active = activeCategory !== null ? categoryQuery : textQuery
  const results = active.data?.data ?? []
  const biased = results.some((r) => r.distanceMeters != null)
  const showResults = focused && (activeCategory !== null || debounced.length >= 2)
  const isFetching = active.isFetching

  const pickChip = (id: string) => {
    if (activeCategory === id) {
      setActiveCategory(null) // toggle off
      return
    }
    setQuery('')
    setDebounced('')
    setActiveCategory(id)
    setFocused(true)
  }

  return (
    <div ref={boxRef} className={cn('pointer-events-auto w-full max-w-xs', className)}>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2.5 focus-within:border-text-muted">
        <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (e.target.value.length > 0) setActiveCategory(null)
          }}
          onFocus={() => setFocused(true)}
          placeholder={
            userLocation ? 'Search nearby places, streets…' : 'Search places, streets, cities…'
          }
          aria-label="Search the map"
          className="w-full bg-transparent text-xs text-foreground placeholder:text-text-muted focus:outline-none"
        />
        {activeCategory && (
          <button
            type="button"
            aria-label="Clear category"
            onClick={() => setActiveCategory(null)}
            className="shrink-0 text-text-muted transition-soft hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
        {isFetching && !activeCategory && (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-text-muted" aria-hidden />
        )}
      </div>

      {/* one-tap nearby categories — only with a real GPS fix */}
      {userLocation && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {CATEGORY_CHIPS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => pickChip(id)}
              aria-pressed={activeCategory === id}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-soft',
                activeCategory === id
                  ? 'border-text-secondary bg-hover text-foreground'
                  : 'border-border bg-panel/90 text-text-secondary hover:bg-hover hover:text-foreground',
              )}
            >
              <Icon className="h-3 w-3" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}

      {showResults && (
        <div className="mt-1.5 max-h-72 overflow-y-auto scroll-slim rounded-lg border border-border bg-popover">
          {biased && results.length > 0 && (
            <p className="border-b border-border px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
              {activeCategory
                ? `${CATEGORY_CHIPS.find((c) => c.id === activeCategory)?.label} near you · sorted by distance`
                : 'Closest to you · sorted by distance'}
            </p>
          )}
          {isFetching && results.length === 0 && (
            <p className="flex items-center gap-1.5 px-3 py-3 text-xs text-text-muted">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              {activeCategory ? 'Finding nearby places…' : 'Searching…'}
            </p>
          )}
          {!isFetching && results.length === 0 && (
            <p className="px-3 py-3 text-xs text-text-muted">
              {active.data?.freshness === 'unavailable'
                ? 'Nearby search unavailable right now.'
                : activeCategory
                  ? 'No nearby places found in this category.'
                  : 'No results. Try a different name.'}
            </p>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onSelect(r)
                setFocused(false)
              }}
              className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-soft hover:bg-hover"
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">{r.label}</span>
                {r.detail && (
                  <span className="block truncate text-[10px] text-text-muted">{r.detail}</span>
                )}
              </span>
              {r.distanceMeters != null && (
                <span className="ml-1 shrink-0 self-center rounded bg-panel-2 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-text-secondary">
                  {formatDistance(r.distanceMeters)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
