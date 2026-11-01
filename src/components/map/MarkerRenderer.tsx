'use client'

// NIGHTRIDE — marker renderer: synchronizes a list of typed markers into
// MapLibre DOM markers with id-based diffing (no unnecessary re-creation).

import { useEffect, useRef } from 'react'
import { Marker, type Map as MLMap } from 'maplibre-gl'
import { createMarkerElement, type MarkerIconName } from './marker-icons'

export interface MapMarkerData {
  id: string
  layer: string
  lat: number
  lng: number
  icon: MarkerIconName
  label: string
  selected?: boolean
  /** degrees (aircraft heading) */
  rotate?: number | null
  onClick?: (id: string) => void
}

interface Rendered {
  marker: Marker
  el: HTMLElement
}

export function MarkerRenderer({
  map,
  markers,
}: {
  map: MLMap | null
  markers: MapMarkerData[]
}) {
  const renderedRef = useRef<Map<string, Rendered>>(new Map())
  const clickHandlersRef = useRef<Map<string, MapMarkerData['onClick']>>(new Map())

  useEffect(() => {
    if (!map) return
    const rendered = renderedRef.current
    const handlers = clickHandlersRef.current
    const nextIds = new Set(markers.map((m) => m.id))

    // remove stale
    for (const [id, r] of rendered) {
      if (!nextIds.has(id)) {
        r.marker.remove()
        rendered.delete(id)
        handlers.delete(id)
      }
    }

    // add / update
    for (const m of markers) {
      handlers.set(m.id, m.onClick)
      const existing = rendered.get(m.id)
      if (existing) {
        existing.marker.setLngLat([m.lng, m.lat])
        // refresh selected state class + title
        const el = existing.el
        if (m.selected && !el.classList.contains('is-selected')) {
          el.classList.add('is-selected')
        } else if (!m.selected && el.classList.contains('is-selected')) {
          el.classList.remove('is-selected')
        }
        if (el.getAttribute('title') !== m.label) {
          el.setAttribute('title', m.label)
          el.setAttribute('aria-label', m.label)
        }
      } else {
        const el = createMarkerElement(m.icon, {
          label: m.label,
          selected: m.selected,
          rotate: m.rotate,
        })
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          handlers.get(m.id)?.(m.id)
        })
        const marker = new Marker({ element: el }).setLngLat([m.lng, m.lat]).addTo(map)
        rendered.set(m.id, { marker, el })
      }
    }
  }, [map, markers])

  // cleanup on unmount
  useEffect(() => {
    const rendered = renderedRef.current
    return () => {
      for (const [, r] of rendered) r.marker.remove()
      rendered.clear()
    }
  }, [])

  return null
}
