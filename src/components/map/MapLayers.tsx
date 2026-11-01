'use client'

// NIGHTRIDE — map layer selector: seven independent, toggleable layers with
// live status per layer (count / loading / unavailable). Presence sharing
// (Rider Locations) is explicit-consent only.

import { useState } from 'react'
import {
  BatteryCharging,
  ChevronDown,
  Eye,
  EyeOff,
  Layers,
  Mountain,
  Plane,
  Radio,
  Siren,
  TriangleAlert,
  Video,
  OctagonX,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMapStore } from '@/stores/map-store'
import { useRealtimeStore } from '@/stores/realtime-store'
import { useAuth } from '@/hooks/use-auth'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { MapLayerId } from '@/types'

interface LayerMeta {
  id: MapLayerId
  label: string
  icon: LucideIcon
  description: string
}

export const LAYER_META: LayerMeta[] = [
  { id: 'riders', label: 'Rider Locations', icon: Radio, description: 'Consenting riders sharing live presence' },
  { id: 'cameras', label: 'Cameras & ALPR', icon: Video, description: 'Flock/ALPR + municipal cameras (open data)' },
  { id: 'road_hazards', label: 'Road Hazards', icon: TriangleAlert, description: 'Hazards, damage, construction, safety' },
  { id: 'road_closures', label: 'Road Closures', icon: OctagonX, description: 'Community-reported closures' },
  { id: 'charging', label: 'Charging Stations', icon: BatteryCharging, description: 'OpenStreetMap charging points' },
  { id: 'riding_areas', label: 'Legal Riding Areas', icon: Mountain, description: 'Community-shared riding locations' },
  { id: 'aviation', label: 'Public Aviation Awareness', icon: Plane, description: 'General air traffic (OpenSky)' },
  { id: 'police_activity', label: 'Police Activity', icon: Siren, description: 'Community sightings — expire after 2 h' },
]

export interface LayerStatus {
  count?: number
  loading?: boolean
  unavailable?: string
}

export function MapLayers({
  statuses,
  onSharePresence,
  sharingPresence,
  canSharePresence,
}: {
  statuses: Partial<Record<MapLayerId, LayerStatus>>
  onSharePresence: (share: boolean) => void
  sharingPresence: boolean
  canSharePresence: boolean
}) {
  const [open, setOpen] = useState(false)
  const layers = useMapStore((s) => s.layers)
  const toggleLayer = useMapStore((s) => s.toggleLayer)
  const riders = useRealtimeStore((s) => s.riders)
  const { user } = useAuth()

  return (
    <div className="pointer-events-auto overflow-hidden rounded-lg border border-border bg-panel">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-soft hover:bg-hover"
      >
        <Layers className="h-4 w-4 text-text-secondary" aria-hidden />
        <span className="text-xs font-medium text-foreground">Layers</span>
        <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-text-muted">
          {Object.values(layers).filter(Boolean).length} active
        </span>
        <ChevronDown
          className={cn('h-4 w-4 text-text-muted transition-soft', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t border-border">
          <ul className="max-h-[55vh] overflow-y-auto scroll-slim p-1.5">
            {LAYER_META.map((meta) => {
              const active = layers[meta.id]
              const status = statuses[meta.id]
              return (
                <li key={meta.id}>
                  <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-soft hover:bg-hover">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <meta.icon
                        className={cn(
                          'h-4 w-4 shrink-0',
                          active ? 'text-foreground' : 'text-text-muted',
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p
                          className={cn(
                            'truncate text-xs font-medium',
                            active ? 'text-foreground' : 'text-text-secondary',
                          )}
                        >
                          {meta.label}
                        </p>
                        <p className="truncate text-[10px] text-text-muted">{meta.description}</p>
                        {status?.unavailable && (
                          <p className="truncate text-[10px] text-status-warning">{status.unavailable}</p>
                        )}
                        {status?.loading && (
                          <p className="text-[10px] text-text-muted">Loading…</p>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-[10px] font-medium tabular-nums text-text-muted">
                      {status?.unavailable
                        ? '—'
                        : status?.count !== undefined
                          ? status.count
                          : ''}
                    </span>
                    <Switch
                      checked={active}
                      onCheckedChange={() => toggleLayer(meta.id)}
                      aria-label={`Toggle ${meta.label} layer`}
                    />
                  </div>
                  {meta.id === 'riders' && active && (
                    <div className="mx-2.5 mb-2 rounded-md border border-border bg-panel-2 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <Label
                          htmlFor="presence-share"
                          className="text-[11px] font-medium leading-snug text-text-secondary"
                        >
                          Share my position with riders
                        </Label>
                        <Switch
                          id="presence-share"
                          checked={sharingPresence}
                          disabled={!canSharePresence}
                          onCheckedChange={(v) => onSharePresence(v)}
                        />
                      </div>
                      <p className="mt-1.5 text-[10px] leading-relaxed text-text-muted">
                        {user
                          ? sharingPresence
                            ? `Sharing while this page is open · ${riders.length} rider${riders.length === 1 ? '' : 's'} visible`
                            : `Off — your location is never shared without this switch · ${riders.length} rider${riders.length === 1 ? '' : 's'} sharing`
                          : 'Sign in and enable location to share your position.'}
                      </p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="flex items-center gap-2 border-t border-border px-3.5 py-2">
            <Eye className="h-3.5 w-3.5 text-text-muted" aria-hidden />
            <p className="text-[10px] leading-relaxed text-text-muted">
              Toggle layers independently. Sources without data stay hidden — never estimated.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
