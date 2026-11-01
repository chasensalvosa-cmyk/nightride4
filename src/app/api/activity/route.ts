// GET /api/activity — chronological feed merging:
//   community reports, road condition updates, road closures (DB),
//   official public safety announcements (DB, NWS-synced),
//   and a live regional aviation activity summary (real OpenSky snapshot).
// Every item carries its real source and timestamp.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchWithCache } from '@/lib/api-cache'
import { fetchAircraft } from '@/lib/external/opensky'
import type { ActivityItem } from '@/types'

// Default awareness region (Seattle metro — the app's default map center).
const AWARENESS_BBOX = { minLat: 47.4, minLng: -122.5, maxLat: 47.8, maxLng: -122.2 }
const AWARENESS_REGION_LABEL = 'Seattle metro area'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const limit = Math.min(
    Math.max(Number.parseInt(url.searchParams.get('limit') ?? '60', 10) || 60, 1),
    150,
  )

  const [reports, safetyEvents, aviation] = await Promise.all([
    db.communityReport.findMany({
      where: { hidden: false },
      include: { user: { select: { username: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: 80,
    }),
    db.publicSafetyEvent.findMany({
      orderBy: { occurredAt: 'desc' },
      take: 40,
    }),
    fetchWithCache({
      key: 'aviation:summary',
      ttl: 60_000,
      source: 'OpenSky Network',
      attribution: 'Data © OpenSky Network',
      fetcher: () => fetchAircraft(AWARENESS_BBOX),
    }),
  ])

  const items: ActivityItem[] = []

  for (const r of reports) {
    const kind =
      r.category === 'road_closure'
        ? 'road_closure'
        : r.category === 'road_hazard' || r.category === 'damaged_road' || r.category === 'construction'
          ? 'road_condition'
          : 'community_report'
    items.push({
      id: `report-${r.id}`,
      kind,
      title: r.title,
      description: r.description,
      timestamp: r.createdAt.toISOString(),
      sourceName: r.user?.username ? `Community report — ${r.user.username}` : 'Community report',
      latitude: r.latitude,
      longitude: r.longitude,
      category: r.category,
      reportId: r.id,
    })
  }

  for (const e of safetyEvents) {
    items.push({
      id: `safety-${e.id}`,
      kind: 'public_safety',
      title: e.title,
      description: e.description.slice(0, 300),
      timestamp: e.occurredAt.toISOString(),
      sourceName: `${e.sourceName} (official)`,
      sourceUrl: e.sourceUrl,
      latitude: e.latitude ?? undefined,
      longitude: e.longitude ?? undefined,
      severity: e.severity,
    })
  }

  // Aviation summary: one REAL snapshot (not a fabricated history) when live.
  if (aviation.freshness !== 'unavailable' && aviation.data) {
    const count = aviation.data.length
    const airborne = aviation.data.filter((a) => !a.onGround).length
    items.push({
      id: `aviation-${aviation.fetchedAt ?? ''}`,
      kind: 'aviation_summary',
      title: `${count} aircraft tracked over ${AWARENESS_REGION_LABEL}`,
      description: `${airborne} airborne · ${count - airborne} on ground. General air-traffic awareness from live ADS-B state vectors (no individual tracking).`,
      timestamp: aviation.fetchedAt ?? new Date().toISOString(),
      sourceName: 'OpenSky Network',
      sourceUrl: 'https://opensky-network.org/',
    })
  }

  items.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))

  return NextResponse.json({
    items: items.slice(0, limit),
    generatedAt: new Date().toISOString(),
  })
}
