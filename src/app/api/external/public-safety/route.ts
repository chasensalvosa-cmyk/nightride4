// GET /api/external/public-safety
// Official public safety feed (NWS active alerts) synced into the
// public_safety_events table, served as a durable, attributed feed.
// Sync cooldown: 5 minutes. Freshness reflects the real NWS response age.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchWithCache } from '@/lib/api-cache'
import { fetchActiveAlerts } from '@/lib/external/nws'
import { serializeSafetyEvent } from '@/lib/serialize'
import { broadcast } from '@/lib/realtime'

const SYNC_COOLDOWN_MS = 5 * 60_000
const MAX_EVENTS = 60
let lastSyncAt = 0

export async function GET() {
  // 1) Fetch from NWS (2-minute cache keeps us inside usage policy).
  const fresh = await fetchWithCache({
    key: 'nws:active',
    ttl: 2 * 60_000,
    source: 'National Weather Service (api.weather.gov)',
    attribution: 'Alerts © National Weather Service — public domain',
    fetcher: fetchActiveAlerts,
  })

  // 2) Sync into the database on a cooldown (durable history for Activity).
  if (fresh.data && Date.now() - lastSyncAt > SYNC_COOLDOWN_MS) {
    lastSyncAt = Date.now()
    try {
      for (const alert of fresh.data.slice(0, MAX_EVENTS)) {
        const occurredAt = alert.onset || alert.effective || new Date().toISOString()
        const existing = await db.publicSafetyEvent.findUnique({
          where: { externalId: alert.id },
          select: { id: true },
        })
        if (!existing) {
          await db.publicSafetyEvent.create({
            data: {
              externalId: alert.id,
              title: alert.headline || alert.event,
              description: alert.description.slice(0, 4000),
              category: alert.event,
              severity: alert.severity,
              latitude: alert.centroidLat,
              longitude: alert.centroidLng,
              areaDesc: alert.areaDesc,
              sourceUrl: alert.webUrl,
              sourceName: 'NWS',
              occurredAt: new Date(occurredAt),
            },
          })
          // Do not broadcast each of 60 inserts — the newest are surfaced
          // by the activity feed directly.
        } else {
          await db.publicSafetyEvent.update({
            where: { externalId: alert.id },
            data: {
              title: alert.headline || alert.event,
              description: alert.description.slice(0, 4000),
              severity: alert.severity,
              areaDesc: alert.areaDesc,
            },
          })
        }
      }
    } catch {
      // DB sync failure must not break the endpoint; events still served below.
    }
  }

  // 3) Serve the durable feed.
  const events = await db.publicSafetyEvent.findMany({
    orderBy: { occurredAt: 'desc' },
    take: 60,
  })

  return NextResponse.json({
    data: events.map(serializeSafetyEvent),
    freshness: fresh.freshness,
    fetchedAt: fresh.fetchedAt,
    source: fresh.source,
    attribution: fresh.attribution,
    note: fresh.note,
  })
}
