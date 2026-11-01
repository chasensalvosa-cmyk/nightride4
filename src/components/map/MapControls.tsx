'use client'

// NIGHTRIDE — map controls: zoom in/out, recenter (permission-gated GPS),
// position calibration (fix a wrong Wi-Fi/network location fix), and the
// layer/search/status overlays are positioned around them.

import { Crosshair, LocateFixed, Minus, Plus } from 'lucide-react'
import { useMapApi } from './map-context'
import { cn } from '@/lib/utils'

export function MapControls({
  onRecenter,
  locating,
  onCalibrate,
  calibrating,
  calibrated,
}: {
  onRecenter: () => void
  locating: boolean
  /** enter position-calibration mode (tap the map where you actually are) */
  onCalibrate: () => void
  /** calibration mode active — the next map tap sets the corrected spot */
  calibrating: boolean
  /** a stored calibration is in effect */
  calibrated: boolean
}) {
  const api = useMapApi()
  return (
    <div className="pointer-events-auto flex flex-col overflow-hidden rounded-lg border border-border bg-panel">
      <button
        type="button"
        onClick={() => api?.zoomIn()}
        aria-label="Zoom in"
        className="flex h-10 w-10 items-center justify-center text-text-secondary transition-soft hover:bg-hover hover:text-foreground"
      >
        <Plus className="h-4.5 w-4.5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => api?.zoomOut()}
        aria-label="Zoom out"
        className="flex h-10 w-10 items-center justify-center border-t border-border text-text-secondary transition-soft hover:bg-hover hover:text-foreground"
      >
        <Minus className="h-4.5 w-4.5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onRecenter}
        aria-label="Recenter to my location"
        title="Recenter to my location (requires location permission)"
        className="flex h-10 w-10 items-center justify-center border-t border-border text-text-secondary transition-soft hover:bg-hover hover:text-foreground"
      >
        <Crosshair
          className={cn('h-4.5 w-4.5', locating && 'animate-pulse text-foreground')}
          aria-hidden
        />
      </button>
      <button
        type="button"
        onClick={onCalibrate}
        aria-label="Fix my location — calibrate my position"
        title={
          calibrated
            ? 'Location calibrated — adjust or clear the correction'
            : 'Wrong location dot? Calibrate your position'
        }
        aria-pressed={calibrating}
        className={cn(
          'flex h-10 w-10 items-center justify-center border-t border-border transition-soft hover:bg-hover hover:text-foreground',
          calibrating
            ? 'animate-pulse text-primary'
            : calibrated
              ? 'text-status-success'
              : 'text-text-secondary',
        )}
      >
        <LocateFixed className="h-4.5 w-4.5" aria-hidden />
      </button>
    </div>
  )
}
