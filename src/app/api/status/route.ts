// GET /api/status — real connectivity tests for every provider.
// A provider is only reported "connected" after a live, successful request.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchWithCache } from '@/lib/api-cache'
import { fetchAircraft } from '@/lib/external/opensky'
import { fetchChargingStations } from '@/lib/external/overpass'
import { fetchActiveAlerts } from '@/lib/external/nws'
import { isCameraProviderConfigured, fetchProviderCameras } from '@/lib/external/cameras'
import { pingRealtimeService } from '@/lib/realtime'
import type { ApiStatusEntry, ApiStatusResponse } from '@/types'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() || ''

async function check(
  key: string,
  provider: string,
  label: string,
  test: () => Promise<{ status: ApiStatusEntry['status']; detail: string }>,
  extra: Partial<ApiStatusEntry> = {},
): Promise<ApiStatusEntry> {
  try {
    const result = await test()
    return {
      key,
      provider,
      label,
      status: result.status,
      detail: result.detail,
      lastChecked: new Date().toISOString(),
      ...extra,
    }
  } catch (err) {
    return {
      key,
      provider,
      label,
      status: 'error',
      detail: err instanceof Error ? err.message : 'Unexpected error.',
      lastChecked: new Date().toISOString(),
      ...extra,
    }
  }
}

async function pingUrl(url: string, init?: RequestInit): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), ...init })
    return res.ok
  } catch {
    return false
  }
}

export async function GET() {
  const checks = await Promise.all([
    check(
      'database',
      'Local database (Prisma SQLite)',
      'Database',
      async () => {
        await db.$queryRaw`SELECT 1`
        return { status: 'connected', detail: 'SQLite reachable — local persistence active.' }
      },
    ),
    check(
      'mapbox',
      'Mapbox',
      'Basemap (Mapbox dark-v11)',
      async () => {
        if (!MAPBOX_TOKEN) {
          return {
            status: 'missing',
            detail:
              'No NEXT_PUBLIC_MAPBOX_TOKEN set — Mapbox dark-v11 tiles disabled. ' +
              'Keyless OpenStreetMap dark basemap is active as fallback.',
          }
        }
        const ok = await pingUrl(
          `https://api.mapbox.com/styles/v1/mapbox/dark-v11?access_token=${encodeURIComponent(MAPBOX_TOKEN)}`,
        )
        return ok
          ? { status: 'connected', detail: 'Token accepted — Mapbox dark-v11 tiles active.' }
          : { status: 'error', detail: 'Token rejected by Mapbox (check validity).' }
      },
      { configVar: 'NEXT_PUBLIC_MAPBOX_TOKEN', configUrl: 'https://account.mapbox.com/access-tokens/' },
    ),
    check(
      'osm',
      'OpenStreetMap / CARTO',
      'Basemap fallback (OSM dark tiles)',
      async () => {
        const ok = await pingUrl('https://a.basemaps.cartocdn.com/dark_all/3/2/3.png')
        return ok
          ? { status: 'connected', detail: 'Dark basemap tiles reachable (keyless).' }
          : { status: 'unreachable', detail: 'Tile server unreachable.' }
      },
      { attribution: '© OpenStreetMap contributors © CARTO' },
    ),
    check(
      'aviation',
      'OpenSky Network',
      'Public aviation awareness',
      async () => {
        const result = await fetchWithCache({
          key: 'status:aviation',
          ttl: 60_000,
          source: 'OpenSky Network',
          attribution: '',
          fetcher: () => fetchAircraft({ minLat: 47.4, minLng: -122.5, maxLat: 47.8, maxLng: -122.2 }),
        })
        if (result.freshness === 'unavailable') {
          return { status: 'unreachable', detail: result.note ?? 'No response.' }
        }
        return {
          status: 'connected',
          detail: `Live state vectors received (${(result.data ?? []).length} aircraft in test region).`,
        }
      },
      { attribution: 'Data © OpenSky Network' },
    ),
    check(
      'charging',
      'Overpass API (OpenStreetMap)',
      'Charging stations',
      async () => {
        const result = await fetchWithCache({
          key: 'status:charging',
          ttl: 120_000,
          source: 'Overpass',
          attribution: '',
          fetcher: () => fetchChargingStations(47.6062, -122.3321, 1500),
        })
        if (result.freshness === 'unavailable') {
          return { status: 'unreachable', detail: result.note ?? 'No response.' }
        }
        return {
          status: 'connected',
          detail: `Real OSM charging stations returned (${(result.data ?? []).length} near test point).`,
        }
      },
      { attribution: '© OpenStreetMap contributors, ODbL' },
    ),
    check(
      'public_safety',
      'National Weather Service',
      'Public safety alerts',
      async () => {
        const result = await fetchWithCache({
          key: 'status:nws',
          ttl: 120_000,
          source: 'NWS',
          attribution: '',
          fetcher: fetchActiveAlerts,
        })
        if (result.freshness === 'unavailable') {
          return { status: 'unreachable', detail: result.note ?? 'No response.' }
        }
        return {
          status: 'connected',
          detail: `Official active alerts received (${(result.data ?? []).length} nationwide).`,
        }
      },
      { attribution: 'Alerts © National Weather Service' },
    ),
    check(
      'cameras',
      'Traffic camera provider',
      'Public traffic cameras',
      async () => {
        if (!isCameraProviderConfigured()) {
          return {
            status: 'missing',
            detail:
              'No official camera API configured (TRAFFIC_CAMERA_API_URL). ' +
              'Layer shows an explicit not-configured state — camera positions are never invented.',
          }
        }
        const result = await fetchWithCache({
          key: 'status:cameras',
          ttl: 120_000,
          source: 'Camera provider',
          attribution: '',
          fetcher: fetchProviderCameras,
        })
        if (result.freshness === 'unavailable') {
          return { status: 'unreachable', detail: result.note ?? 'No response.' }
        }
        return {
          status: 'connected',
          detail: `Camera inventory received (${(result.data?.cameras ?? []).length} cameras).`,
        }
      },
      { configVar: 'TRAFFIC_CAMERA_API_URL', configUrl: 'https://www.wsdot.wa.gov/traffic/api/' },
    ),
    check(
      'supabase',
      'Supabase',
      'Production database / auth',
      async () => {
        const url = process.env.SUPABASE_URL?.trim()
        const key = process.env.SUPABASE_ANON_KEY?.trim()
        if (!url || !key) {
          return {
            status: 'missing',
            detail:
              'SUPABASE_URL / SUPABASE_ANON_KEY not set. Local Prisma persistence is active; ' +
              'production schema + RLS policies are provided in supabase/migrations.',
          }
        }
        const ok = await pingUrl(`${url}/rest/v1/?apikey=${encodeURIComponent(key)}`)
        return ok
          ? { status: 'connected', detail: 'Supabase REST reachable with anon key.' }
          : { status: 'error', detail: 'Supabase rejected the anon key or is unreachable.' }
      },
      { configVar: 'SUPABASE_URL, SUPABASE_ANON_KEY', configUrl: 'https://supabase.com/dashboard' },
    ),
    check(
      'realtime',
      'Realtime service (Socket.IO)',
      'Live updates',
      async () => {
        const ok = await pingRealtimeService()
        return ok
          ? { status: 'connected', detail: 'Realtime service reachable — live updates enabled.' }
          : { status: 'unreachable', detail: 'Realtime service not responding (mini-service on :3003).' }
      },
    ),
  ])

  const response: ApiStatusResponse = {
    checkedAt: new Date().toISOString(),
    providers: checks,
  }
  return NextResponse.json(response)
}
