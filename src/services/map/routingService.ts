// NIGHTRIDE — routing service (client side).
// Fastest routes + alternatives between the rider's live position and a chosen
// destination, via the server-proxied OSRM endpoint. Honesty-first: failures
// come back as freshness 'unavailable' with a note, never as fake geometry.

import { api } from '@/lib/api-client'
import type { FreshData, RouteOption } from '@/types'

export interface RouteEndpoint {
  lat: number
  lng: number
}

export function fetchRoute(
  from: RouteEndpoint,
  to: RouteEndpoint,
): Promise<FreshData<RouteOption[]>> {
  return api.get<FreshData<RouteOption[]>>(
    `/api/external/route?from=${from.lat.toFixed(6)},${from.lng.toFixed(6)}&to=${to.lat.toFixed(6)},${to.lng.toFixed(6)}`,
  )
}
