// NIGHTRIDE — saved locations service (client module).

import { api } from '@/lib/api-client'
import type { SavedLocation, SavedLocationCategory } from '@/types'

export function fetchSavedLocations(): Promise<{ locations: SavedLocation[] }> {
  return api.get('/api/locations')
}

export function createSavedLocation(body: {
  name: string
  description?: string
  latitude: number
  longitude: number
  category: SavedLocationCategory
}): Promise<{ location: SavedLocation }> {
  return api.post('/api/locations', body)
}

export function updateSavedLocation(
  id: string,
  body: Partial<{
    name: string
    description: string
    latitude: number
    longitude: number
    category: SavedLocationCategory
  }>,
): Promise<{ location: SavedLocation }> {
  return api.patch(`/api/locations/${id}`, body)
}

export function deleteSavedLocation(id: string): Promise<{ ok: boolean }> {
  return api.del(`/api/locations/${id}`)
}
