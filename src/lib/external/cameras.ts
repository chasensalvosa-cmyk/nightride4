// NIGHTRIDE — public traffic camera service module.
// Displays DOCUMENTED public traffic camera locations only, from an
// officially configured provider (e.g. a state DOT traveler information
// API) or a verified inventory in the public_camera_locations table.
//
// When no provider is configured the module returns `notConfigured` and the
// UI shows an explicit state — camera coordinates are NEVER invented.

import { fetchJson } from './http'

export interface CameraProviderResult {
  cameras: {
    id: string
    name: string
    latitude: number
    longitude: number
    cameraType: string
    sourceUrl: string
    lastVerifiedAt: string
  }[]
  sourceName: string
}

export function isCameraProviderConfigured(): boolean {
  const url = process.env.TRAFFIC_CAMERA_API_URL?.trim()
  return !!url && /^https?:\/\//.test(url)
}

/** Generic normalizer covering common municipal/DOT camera API shapes. */
function normalizeProviderResponse(
  raw: unknown,
  providerUrl: string,
): CameraProviderResult['cameras'] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { cameras?: unknown[] })?.cameras)
      ? (raw as { cameras: unknown[] }).cameras
      : Array.isArray((raw as { features?: unknown[] })?.features)
        ? (raw as { features: unknown[] }).features
        : []

  const out: CameraProviderResult['cameras'] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const lat = num(o.latitude ?? o.Latitude ?? o.lat ?? o.Lat)
    const lng = num(o.longitude ?? o.Longitude ?? o.lon ?? o.Lng ?? o.lon)
    const name = str(o.name ?? o.Name ?? o.title ?? o.Title ?? o.Description)
    if (lat === null || lng === null || !name) continue
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue
    out.push({
      id: str(o.id ?? o.Id ?? o.cameraId ?? o.SourceId) || `cam-${lat},${lng}`,
      name,
      latitude: lat,
      longitude: lng,
      cameraType: str(o.cameraType ?? o.Type) || 'traffic',
      sourceUrl: str(o.sourceUrl ?? o.Image ?? o.url) || providerUrl,
      lastVerifiedAt: new Date().toISOString(),
    })
  }
  return out
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number.parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

/**
 * Fetch cameras from the configured official provider.
 * Throws when not configured — callers surface the honest state.
 */
export async function fetchProviderCameras(): Promise<CameraProviderResult> {
  const providerUrl = process.env.TRAFFIC_CAMERA_API_URL!.trim()
  const apiKey = process.env.TRAFFIC_CAMERA_API_KEY?.trim()

  // WSDOT-style AccessCode + generic ?key= / x-api-key support.
  let url = providerUrl
  if (apiKey) {
    url += (providerUrl.includes('?') ? '&' : '?') + `AccessCode=${encodeURIComponent(apiKey)}`
  }
  const raw = await fetchJson<unknown>(url, {
    headers: apiKey ? { 'x-api-key': apiKey } : {},
    timeoutMs: 9000,
    retries: 1,
  })
  let hostname = providerUrl
  try {
    hostname = new URL(providerUrl).hostname
  } catch {
    /* keep raw url */
  }
  return {
    cameras: normalizeProviderResponse(raw, providerUrl),
    sourceName: hostname,
  }
}
