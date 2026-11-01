'use client'

// Client loader for the map experience — MapLibre must never render on the
// server, so the whole view is dynamically imported with ssr disabled.

import dynamic from 'next/dynamic'
import { MapPin } from 'lucide-react'

const MapView = dynamic(() => import('@/components/map/MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background">
      <span className="flex h-10 w-10 animate-pulse items-center justify-center rounded-lg border border-border bg-panel">
        <MapPin className="h-5 w-5 text-text-muted" aria-hidden />
      </span>
      <p className="text-xs text-text-muted">Loading live map…</p>
    </div>
  ),
})

export default function MapClient() {
  return <MapView />
}
