'use client'

// NIGHTRIDE — saved locations: save/name/describe/categorize/delete + map links.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Bookmark, MapPin, Plus, Trash2 } from 'lucide-react'
import { fetchSavedLocations, deleteSavedLocation } from '@/services/locations/savedLocationService'
import { SaveLocationDialog, type SaveLocationDraft } from '@/components/shared/save-location-dialog'
import { AuthGate, EmptyState, LoadingRows, Panel, SectionHeader } from '@/components/shared/panels'
import { SAVED_LOCATION_CATEGORY_META } from '@/lib/categories'
import { RelativeTime } from '@/components/shared/status'
import { useAuth } from '@/hooks/use-auth'
import { useGeolocation } from '@/hooks/use-geolocation'
import { useMapStore } from '@/stores/map-store'
import { Button } from '@/components/ui/button'
import { formatCoordinate } from '@/lib/geo'
import { cn } from '@/lib/utils'
import type { SavedLocation, SavedLocationCategory } from '@/types'

export default function SavedPage() {
  const { user, loading: authLoading } = useAuth()
  const signedIn = !!user && !authLoading
  const queryClient = useQueryClient()
  const geo = useGeolocation({ auto: false })
  const mapView = useMapStore((s) => s.view)

  const [saveOpen, setSaveOpen] = useState(false)
  const [saveDraft, setSaveDraft] = useState<SaveLocationDraft | null>(null)
  const [filter, setFilter] = useState<SavedLocationCategory | 'all'>('all')

  const locationsQuery = useQuery({
    queryKey: ['saved-locations'],
    queryFn: fetchSavedLocations,
    enabled: signedIn,
    staleTime: 30_000,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSavedLocation(id),
    onSuccess: () => {
      toast.success('Location deleted')
      void queryClient.invalidateQueries({ queryKey: ['saved-locations'] })
    },
    onError: (err) => toast.error('Could not delete', { description: err.message }),
  })

  const openSave = async () => {
    let draft: SaveLocationDraft = { lat: mapView.lat, lng: mapView.lng }
    if (geo.permission !== 'granted') {
      const fix = await geo.requestOnce()
      if (fix) draft = { lat: fix.lat, lng: fix.lng }
    } else if (geo.coords) {
      draft = { lat: geo.coords.lat, lng: geo.coords.lng }
    }
    setSaveDraft(draft)
    setSaveOpen(true)
  }

  const locations = (locationsQuery.data?.locations ?? []).filter(
    (l) => filter === 'all' || l.category === filter,
  )
  const allLocations = locationsQuery.data?.locations ?? []
  const categoriesInUse = Array.from(new Set(allLocations.map((l) => l.category)))

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Saved locations</h1>
          <p className="mt-0.5 text-xs text-text-secondary">
            Charging spots, viewpoints, meeting points — private to your account, one tap to the map.
          </p>
        </div>
        {signedIn && (
          <Button size="sm" className="gap-1.5" onClick={openSave}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Save current position
          </Button>
        )}
      </div>

      {!signedIn ? (
        <Panel>
          <SectionHeader label="Saved locations" icon={Bookmark} />
          <AuthGate feature="save locations" />
        </Panel>
      ) : locationsQuery.isLoading ? (
        <Panel>
          <LoadingRows rows={4} />
        </Panel>
      ) : allLocations.length === 0 ? (
        <Panel>
          <SectionHeader label="Saved locations" icon={Bookmark} />
          <EmptyState
            icon={Bookmark}
            title="Nothing saved yet"
            description="Save your GPS position now, or pick any point on the map and choose Save location."
            actionLabel="Open map"
            actionHref="/map"
          />
        </Panel>
      ) : (
        <>
          {categoriesInUse.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {(['all', ...categoriesInUse] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFilter(c)}
                  aria-pressed={filter === c}
                  className={cn(
                    'rounded-md border px-2 py-1 text-[10px] font-medium uppercase tracking-wider transition-soft',
                    filter === c
                      ? 'border-foreground/60 bg-hover text-foreground'
                      : 'border-border bg-panel text-text-muted hover:text-text-secondary',
                  )}
                >
                  {c === 'all' ? 'All' : SAVED_LOCATION_CATEGORY_META[c].label}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {locations.map((l: SavedLocation) => (
              <article key={l.id} className="rounded-lg border border-border bg-panel p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground">{l.name}</h3>
                    <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                      {SAVED_LOCATION_CATEGORY_META[l.category]?.label ?? l.category}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete ${l.name}`}
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete "${l.name}"?`)) deleteMutation.mutate(l.id)
                    }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-soft hover:bg-hover hover:text-status-danger"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                {l.description && (
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-text-secondary">
                    {l.description}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[10px] text-text-muted">
                    <MapPin className="h-3 w-3" aria-hidden />
                    {formatCoordinate(l.latitude, 'lat')} · {formatCoordinate(l.longitude, 'lng')}
                  </p>
                  <RelativeTime iso={l.createdAt} />
                </div>
                <Button asChild size="sm" variant="secondary" className="mt-3 w-full">
                  <a href={`/map?lat=${l.latitude}&lng=${l.longitude}&zoom=14`}>View on map</a>
                </Button>
              </article>
            ))}
          </div>
          {locations.length === 0 && (
            <Panel>
              <EmptyState
                icon={Bookmark}
                title="No locations in this category"
                description="Switch filters or save a new location."
              />
            </Panel>
          )}
        </>
      )}

      <SaveLocationDialog open={saveOpen} draft={saveDraft} onOpenChange={setSaveOpen} />
    </div>
  )
}
