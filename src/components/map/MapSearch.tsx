'use client'

// NIGHTRIDE — map search (server-proxied Nominatim with debounce).
// When the rider has a GPS fix the search is biased to their area: matches
// are boxed to ±35 km, sorted by real distance and labelled "x away".

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, MapPin, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistance } from '@/lib/geo'
import { api } from '@/lib/api-client'
import type { FreshData, GeocodeResult } from '@/types'

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

  const { data, isFetching } = useQuery({
    queryKey: ['geocode', debounced, nearKey ?? 'global'],
    queryFn: () =>
      api.get<FreshData<GeocodeResult[]>>(
        `/api/external/geocode?q=${encodeURIComponent(debounced)}${
          userLocation
            ? `&lat=${userLocation.lat.toFixed(5)}&lng=${userLocation.lng.toFixed(5)}`
            : ''
        }`,
      ),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  })

  const results = data?.data ?? []
  const biased = results.some((r) => r.distanceMeters != null)
  const showResults = focused && debounced.length >= 2

  return (
    <div ref={boxRef} className={cn('pointer-events-auto w-full max-w-xs', className)}>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2.5 focus-within:border-text-muted">
        <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder={
            userLocation ? 'Search nearby places, streets…' : 'Search places, streets, cities…'
          }
          aria-label="Search the map"
          className="w-full bg-transparent text-xs text-foreground placeholder:text-text-muted focus:outline-none"
        />
        {isFetching && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-text-muted" aria-hidden />}
      </div>

      {showResults && (
        <div className="mt-1.5 max-h-72 overflow-y-auto scroll-slim rounded-lg border border-border bg-popover">
          {biased && results.length > 0 && (
            <p className="border-b border-border px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
              Closest to you · sorted by distance
            </p>
          )}
          {isFetching && results.length === 0 && (
            <p className="px-3 py-3 text-xs text-text-muted">Searching…</p>
          )}
          {!isFetching && results.length === 0 && (
            <p className="px-3 py-3 text-xs text-text-muted">
              {data?.freshness === 'unavailable'
                ? 'Search unavailable right now.'
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
