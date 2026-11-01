// NIGHTRIDE — API status service (client module).

import { api } from '@/lib/api-client'
import type { ActivityItem, ApiStatusResponse } from '@/types'

export function fetchApiStatus(): Promise<ApiStatusResponse> {
  return api.get('/api/status')
}

export function fetchActivity(limit = 60): Promise<{ items: ActivityItem[]; generatedAt: string }> {
  return api.get(`/api/activity?limit=${limit}`)
}
