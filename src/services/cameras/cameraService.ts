// NIGHTRIDE — traffic camera service (client module).
// Only documented public cameras from a configured official provider or a
// verified inventory. Explicit unavailable state otherwise.

import { api } from '@/lib/api-client'
import type { FreshData, PublicCameraLocation } from '@/types'

export function fetchCameras(): Promise<FreshData<PublicCameraLocation[]>> {
  return api.get('/api/external/cameras')
}
