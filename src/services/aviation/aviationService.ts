// NIGHTRIDE — aviation service (client module; UI never fetches directly).

import { api } from '@/lib/api-client'
import type { AircraftState, FreshData } from '@/types'

export interface AviationQuery {
  minLat: number
  minLng: number
  maxLat: number
  maxLng: number
}

export function fetchAviation(
  q: AviationQuery,
  signal?: AbortSignal,
): Promise<FreshData<AircraftState[]>> {
  const params = new URLSearchParams({
    minLat: String(q.minLat),
    minLng: String(q.minLng),
    maxLat: String(q.maxLat),
    maxLng: String(q.maxLng),
  })
  return api.get(`/api/external/aviation?${params.toString()}`)
}
