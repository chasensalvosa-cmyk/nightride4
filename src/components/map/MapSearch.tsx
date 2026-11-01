'use client'

// NIGHTRIDE — map search (server-proxied Nominatim with debounce).

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, MapPin, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api-client'
import type { FreshData, GeocodeResult } from '@/types'

export function MapSearch({
  onSelect,
  className,
}: {
  onSelect: (result: GeocodeResult) => void
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

  const { data, isFetching } = useQuery({
    queryKey: ['geocode', debounced],
    queryFn: () =>
      api.get<FreshData<GeocodeResult[]>>(
        `/api/external/geocode?q=${encodeURIComponent(debounced)}`,
      ),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  })

  const results = data?.data ?? []
  const showResults = focused && debounced.length >= 2

  return (
    <div ref={boxRef} className={cn('pointer-events-auto w-full max-w-xs', className)}>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2.5 focus-within:border-text-muted">
        <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Search places, streets, cities…"
          aria-label="Search the map"
          className="w-full bg-transparent text-xs text-foreground placeholder:text-text-muted focus:outline-none"
        />
        {isFetching && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-text-muted" aria-hidden />}
      </div>

      {showResults && (
        <div className="mt-1.5 max-h-72 overflow-y-auto scroll-slim rounded-lg border border-border bg-popover">
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
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium text-foreground">{r.label}</span>
                {r.detail && (
                  <span className="block truncate text-[10px] text-text-muted">{r.detail}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
