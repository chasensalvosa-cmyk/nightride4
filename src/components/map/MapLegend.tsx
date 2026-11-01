'use client'

// NIGHTRIDE — map legend: shows the icon meanings of currently active layers.

import { useMapStore } from '@/stores/map-store'
import { LAYER_META } from './MapLayers'
import { markerIconSvg, type MarkerIconName } from './marker-icons'
import { cn } from '@/lib/utils'

const LAYER_ICONS: Record<string, MarkerIconName[]> = {
  riders: ['rider'],
  cameras: ['camera'],
  road_hazards: ['hazard', 'damage', 'construction', 'safety'],
  road_closures: ['closure'],
  charging: ['charging'],
  riding_areas: ['riding'],
  aviation: ['plane'],
}

const ICON_LABELS: Record<MarkerIconName, string> = {
  hazard: 'Hazard',
  damage: 'Damaged road',
  construction: 'Construction',
  closure: 'Closure',
  charging: 'Charging',
  riding: 'Riding area',
  safety: 'Safety report',
  camera: 'Traffic camera',
  plane: 'Aircraft',
  rider: 'Rider (consented)',
  pin: 'Location',
}

export function MapLegend() {
  const layers = useMapStore((s) => s.layers)
  const active = LAYER_META.filter((m) => layers[m.id])
  if (active.length === 0) return null

  return (
    <div className="pointer-events-auto max-w-[13rem] rounded-lg border border-border bg-panel/95 px-3 py-2.5 backdrop-blur-sm">
      <p className="label-micro mb-2">Legend</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {active.flatMap((m) =>
          (LAYER_ICONS[m.id] ?? []).map((icon) => (
            <span
              key={`${m.id}-${icon}`}
              className={cn('flex items-center gap-1.5 text-[10px] text-text-secondary')}
            >
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-panel-2 [&_svg]:h-3 [&_svg]:w-3"
                dangerouslySetInnerHTML={{ __html: markerIconSvg(icon) }}
                aria-hidden
              />
              {ICON_LABELS[icon]}
            </span>
          )),
        )}
      </div>
    </div>
  )
}
