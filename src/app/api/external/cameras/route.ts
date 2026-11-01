// GET /api/external/cameras
// Public camera locations. Sources, in priority order:
//   1. Configured official provider (e.g. state DOT traveler API) — full list.
//   2. Verified inventory in the database (DeFlock / OpenStreetMap ALPR sync
//      or a staged municipal import) — filtered by the requested bounding box
//      so the 145k-camera ALPR dataset stays cheap to serve.
// Honesty-first: with no provider and an empty inventory the endpoint returns
// an explicit not_configured state — coordinates are never invented.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchWithCache } from '@/lib/api-cache'
import {
  fetchProviderCameras,
  isCameraProviderConfigured,
} from '@/lib/external/cameras'
import { serializeCamera } from '@/lib/serialize'

const ALPR_ATTRIBUTION =
  '© OpenStreetMap contributors (ODbL) · DeFlock (deflock.org)'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const minLat = Number.parseFloat(url.searchParams.get('minLat') ?? '')
  const minLng = Number.parseFloat(url.searchParams.get('minLng') ?? '')
  const maxLat = Number.parseFloat(url.searchParams.get('maxLat') ?? '')
  const maxLng = Number.parseFloat(url.searchParams.get('maxLng') ?? '')
  const hasBbox = [minLat, minLng, maxLat, maxLng].every(Number.isFinite)

  // 1) Configured official provider (e.g. state DOT traveler API).
  if (isCameraProviderConfigured()) {
    const result = await fetchWithCache({
      key: 'cameras:provider',
      ttl: 5 * 60_000,
      source: 'Configured camera provider',
      attribution: 'Official transportation department inventory',
      fetcher: fetchProviderCameras,
    })
    if (result.data) {
      return NextResponse.json({
        data: result.data.cameras.map((c) => ({
          ...c,
          brand: null,
          sourceName: result.data!.sourceName,
          lastVerifiedAt: c.lastVerifiedAt,
        })),
        freshness: result.freshness,
        fetchedAt: result.fetchedAt,
        source: result.data.sourceName,
        attribution: result.attribution,
        note: result.note,
      })
    }
    return NextResponse.json({
      data: [],
      freshness: 'unavailable',
      fetchedAt: null,
      source: 'Configured camera provider',
      attribution: '',
      note: result.note ?? 'Provider unreachable.',
    })
  }

  // 2) Verified inventory staged in the database (DeFlock/OSM ALPR sync).
  //    Bounded to the requested map viewport; a hard cap keeps responses light
  //    even over dense metro areas. An empty viewport result is a legitimate
  //    "no cameras here" — only a never-synced inventory is unavailable.
  const CAP = 750
  const hasInventory = await db.publicCameraLocation.findFirst({ select: { id: true } })
  if (hasInventory) {
    const bboxFilter = hasBbox
      ? { latitude: { gte: minLat, lte: maxLat }, longitude: { gte: minLng, lte: maxLng } }
      : {}
    const staged = await db.publicCameraLocation.findMany({
      where: bboxFilter,
      orderBy: { lastVerifiedAt: 'desc' },
      take: CAP,
    })
    const newest = staged[0]?.lastVerifiedAt ?? new Date()
    const alprCount = staged.filter((c) => c.cameraType === 'alpr').length
    return NextResponse.json({
      data: staged.map(serializeCamera),
      freshness: 'live',
      fetchedAt: new Date().toISOString(),
      source: alprCount > 0 ? 'DeFlock · OpenStreetMap' : 'Verified public inventory',
      attribution: alprCount > 0 ? ALPR_ATTRIBUTION : 'Each camera links to its public source',
      syncedAt: newest.toISOString(),
      note: hasBbox
        ? undefined
        : 'No bounding box supplied — showing most recently verified cameras only.',
    })
  }

  // 3) Honest unavailable state.
  return NextResponse.json({
    data: [],
    freshness: 'unavailable',
    fetchedAt: null,
    source: 'Not configured',
    attribution: '',
    note: hasBbox
      ? 'No cameras synced for this area yet. Run `bun scripts/sync-alpr-cameras.ts` ' +
        'to import the DeFlock / OpenStreetMap ALPR inventory, or set TRAFFIC_CAMERA_API_URL ' +
        'to an official municipal camera API. Camera positions are never estimated.'
      : 'No public camera source is configured. Run `bun scripts/sync-alpr-cameras.ts` ' +
        '(DeFlock / OpenStreetMap ALPR inventory) or set TRAFFIC_CAMERA_API_URL to an ' +
        'official municipal camera API — e.g. WSDOT (https://www.wsdot.wa.gov/traffic/api/). ' +
        'Camera positions are never estimated.',
  })
}
