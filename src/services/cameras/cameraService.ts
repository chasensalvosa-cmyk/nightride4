// NIGHTRIDE — traffic camera service (client module).
// Only documented public cameras from a configured official provider or the
// verified DeFlock / OpenStreetMap ALPR inventory (bbox-filtered server-side).
// Explicit unavailable state otherwise.

import { api } from '@/lib/api-client'
import type { FreshData, PublicCameraLocation } from '@/types'

export interface CameraBbox {
  minLat: number
  minLng: number
  maxLat: number
  maxLng: number
}

export function fetchCameras(bbox?: CameraBbox): Promise<FreshData<PublicCameraLocation[]>> {
  if (bbox) {
    const q = new URLSearchParams({
      minLat: String(bbox.minLat),
      minLng: String(bbox.minLng),
      maxLat: String(bbox.maxLat),
      maxLng: String(bbox.maxLng),
    })
    return api.get(`/api/external/cameras?${q.toString()}`)
  }
  return api.get('/api/external/cameras')
}
