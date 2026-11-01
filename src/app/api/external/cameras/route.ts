// GET /api/external/cameras
// Public traffic camera locations. Honesty-first: when no official provider
// is configured and no verified inventory exists, the endpoint returns an
// explicit not_configured state — coordinates are never invented.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchWithCache } from '@/lib/api-cache'
import {
  fetchProviderCameras,
  isCameraProviderConfigured,
} from '@/lib/external/cameras'
import { serializeCamera } from '@/lib/serialize'

export async function GET() {
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

  // 2) Verified inventory staged in the database (source_url + verified date).
  const staged = await db.publicCameraLocation.findMany({
    orderBy: { name: 'asc' },
    take: 500,
  })
  if (staged.length > 0) {
    return NextResponse.json({
      data: staged.map(serializeCamera),
      freshness: 'live',
      fetchedAt: new Date().toISOString(),
      source: 'Verified public inventory',
      attribution: 'Each camera links to its public source',
    })
  }

  // 3) Honest unavailable state.
  return NextResponse.json({
    data: [],
    freshness: 'unavailable',
    fetchedAt: null,
    source: 'Not configured',
    attribution: '',
    note:
      'No public traffic camera source is configured. Set TRAFFIC_CAMERA_API_URL ' +
      '(and TRAFFIC_CAMERA_API_KEY) to an official municipal or state transportation ' +
      'department camera API — for example the WSDOT Traveler Information API ' +
      '(https://www.wsdot.wa.gov/traffic/api/). Camera positions are never estimated.',
  })
}
