// NIGHTRIDE — public safety service (client module).
// Official NWS alerts synced into a durable, attributed feed.

import { api } from '@/lib/api-client'
import type { FreshData, PublicSafetyEvent } from '@/types'

export function fetchPublicSafety(): Promise<FreshData<PublicSafetyEvent[]>> {
  return api.get('/api/external/public-safety')
}
