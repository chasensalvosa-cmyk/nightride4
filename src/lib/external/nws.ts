// NIGHTRIDE — National Weather Service (api.weather.gov) service module.
// Official US government public safety feed: active watches/warnings/
// advisories. Public domain. Custom User-Agent is mandatory. Results are
// synced into the public_safety_events table by the API route.

import { fetchJson } from './http'

const BASE_URL = 'https://api.weather.gov'
const UA = 'NIGHTRIDE/1.0 (e-moto community safety platform)'

export interface NwsAlert {
  id: string
  event: string
  headline: string | null
  description: string
  severity: string
  urgency: string | null
  areaDesc: string | null
  effective: string | null
  onset: string | null
  expires: string | null
  /** polygon centroid, display purposes only (null when zone-based alert) */
  centroidLat: number | null
  centroidLng: number | null
  webUrl: string
}

interface NwsAlertsResponse {
  features: {
    id: string
    properties: Record<string, unknown>
    geometry: { type: string; coordinates: number[][][] } | null
  }[]
}

const SEVERITY_ORDER: Record<string, number> = {
  Extreme: 4,
  Severe: 3,
  Moderate: 2,
  Minor: 1,
  Unknown: 0,
}

/** Fetch active alerts, most severe first. */
export async function fetchActiveAlerts(): Promise<NwsAlert[]> {
  const data = await fetchJson<NwsAlertsResponse>(
    `${BASE_URL}/alerts/active?status=actual`,
    {
      headers: {
        'User-Agent': UA,
        Accept: 'application/geo+json',
      },
      timeoutMs: 8000,
      retries: 1,
    },
  )
  return (data.features ?? [])
    .map((f) => toAlert(f.properties, f.geometry))
    .filter((a): a is NwsAlert => a !== null)
    .sort(
      (a, b) =>
        (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0),
    )
}

function toAlert(
  p: Record<string, unknown>,
  geometry: NwsAlertsResponse['features'][number]['geometry'],
): NwsAlert | null {
  const id = typeof p.id === 'string' ? p.id : null
  const event = typeof p.event === 'string' ? p.event : null
  const description = typeof p.description === 'string' ? p.description : null
  if (!id || !event || !description) return null

  let centroidLat: number | null = null
  let centroidLng: number | null = null
  if (geometry?.coordinates?.length) {
    // Simple centroid over all polygon points (display purposes only).
    let sumLng = 0
    let sumLat = 0
    let count = 0
    for (const ring of geometry.coordinates) {
      for (const [lng, lat] of ring) {
        if (typeof lng === 'number' && typeof lat === 'number') {
          sumLng += lng
          sumLat += lat
          count++
        }
      }
    }
    if (count > 0) {
      centroidLng = sumLng / count
      centroidLat = sumLat / count
    }
  }

  return {
    id,
    event,
    headline: typeof p.headline === 'string' ? p.headline : null,
    description: description.trim(),
    severity: typeof p.severity === 'string' ? p.severity : 'Unknown',
    urgency: typeof p.urgency === 'string' ? p.urgency : null,
    areaDesc: typeof p.areaDesc === 'string' ? p.areaDesc : null,
    effective: typeof p.effective === 'string' ? p.effective : null,
    onset: typeof p.onset === 'string' ? p.onset : null,
    expires: typeof p.expires === 'string' ? p.expires : null,
    centroidLat,
    centroidLng,
    webUrl: 'https://alerts.weather.gov/',
  }
}
