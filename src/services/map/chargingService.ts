// NIGHTRIDE — charging station service (client module).
// Data: real OpenStreetMap charging POIs via the Overpass proxy.

import { api } from '@/lib/api-client'
import type { ChargingStation, FreshData } from '@/types'

export function fetchChargingStations(
  lat: number,
  lng: number,
  radius = 6000,
): Promise<FreshData<ChargingStation[]>> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius: String(radius),
  })
  return api.get(`/api/external/charging?${params.toString()}`)
}
