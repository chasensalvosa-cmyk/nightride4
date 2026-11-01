// NIGHTRIDE — ride service (client module).

import { api } from '@/lib/api-client'
import type { Ride, TrackPoint } from '@/types'

export function fetchRides(status?: 'active' | 'paused' | 'completed'): Promise<{ rides: Ride[] }> {
  const qs = status ? `?status=${status}` : ''
  return api.get(`/api/rides${qs}`)
}

export function fetchActiveRide(): Promise<{ ride: Ride | null }> {
  return api.get('/api/rides/active')
}

export function startRide(): Promise<{ ride: Ride }> {
  return api.post('/api/rides', {})
}

export function updateRide(
  id: string,
  body: {
    status?: 'active' | 'paused' | 'completed'
    endedAt?: string
    durationSeconds?: number
    distanceMeters?: number
    averageSpeed?: number
    maximumSpeed?: number
    appendPoints?: TrackPoint[]
    title?: string | null
  },
): Promise<{ ride: Ride }> {
  return api.patch(`/api/rides/${id}`, body)
}

export function deleteRide(id: string): Promise<{ ok: boolean }> {
  return api.del(`/api/rides/${id}`)
}
