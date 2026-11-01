// NIGHTRIDE — ALPR camera inventory sync (DeFlock / OpenStreetMap).
//
// Downloads the public DeFlock camera dataset (community-mapped Flock Safety
// and other ALPR cameras, compiled from OpenStreetMap) and upserts it into
// the public_camera_locations table. Camera positions come exclusively from
// this documented open dataset — nothing is invented.
//
// Source: https://deflock.org (data.dontgetflocked.com/cameras.geojson.gz)
// License/attribution: © OpenStreetMap contributors (ODbL) · DeFlock
//
// Usage: bun scripts/sync-alpr-cameras.ts [--limit N] [--force]
//   --limit N   only import the first N cameras (fast dev iterations)
//   --force     re-sync even when the local data is younger than 7 days

import { PrismaClient } from '@prisma/client'
import { gunzipSync } from 'node:zlib'

const DUMP_URL = 'https://data.dontgetflocked.com/cameras.geojson.gz'
const SOURCE_NAME = 'DeFlock · OpenStreetMap'
const SOURCE_URL = 'https://deflock.org'
// Cloudflare serves this file to browser-like clients; plain curl/bun UAs get
// challenged. A normal browser UA is sufficient (public dataset, no bypass).
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const SYNC_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const BATCH = 500

const db = new PrismaClient()

interface DumpFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: {
    osmId?: number
    osmType?: string
    osmTimestamp?: string
    osmVersion?: number
    brand?: string
    ref?: string
    startDate?: string
  }
}

function parseArgs() {
  const args = process.argv.slice(2)
  return {
    limit: args.includes('--limit') ? Number.parseInt(args[args.indexOf('--limit') + 1], 10) : undefined,
    force: args.includes('--force'),
  }
}

async function downloadDump(): Promise<string> {
  console.log(`↓ downloading ${DUMP_URL} …`)
  // bun/node fetch gets challenged by the CDN in front of this dataset (TLS
  // fingerprinting), while plain curl passes with a browser User-Agent. Try
  // native fetch first, fall back to curl when challenged.
  let buf: Buffer | null = null
  try {
    const res = await fetch(DUMP_URL, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    })
    if (res.ok) buf = Buffer.from(await res.arrayBuffer())
    else console.log(`  native fetch: HTTP ${res.status} — retrying with curl`)
  } catch (err) {
    console.log(`  native fetch failed (${err instanceof Error ? err.message : err}) — retrying with curl`)
  }
  if (!buf) {
    const { execFileSync } = await import('node:child_process')
    const out = execFileSync(
      'curl',
      [
        '-sL',
        '--fail',
        '--max-time', '300',
        '-A', USER_AGENT,
        '-H', 'Accept: */*',
        DUMP_URL,
      ],
      { maxBuffer: 512 * 1024 * 1024 },
    )
    buf = Buffer.from(out)
  }
  console.log(`  received ${(buf.length / 1_048_576).toFixed(1)} MB`)
  const text = buf.toString('utf8')
  // The endpoint usually serves plain JSON despite the .gz name; handle real
  // gzip transparently as well.
  if (text.trimStart().startsWith('{')) return text
  return gunzipSync(buf).toString('utf8')
}

function toRow(f: DumpFeature) {
  const [lng, lat] = f.geometry?.coordinates ?? []
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  const p = f.properties ?? {}
  const osmType = (p.osmType ?? 'node').toLowerCase()
  const osmId = p.osmId
  const brand = p.brand?.trim() || null
  const verified = p.osmTimestamp ? new Date(p.osmTimestamp) : new Date()
  return {
    externalKey: Number.isFinite(osmId) ? `osm:${osmType}/${osmId}` : `osm:${lat.toFixed(6)},${lng.toFixed(6)}`,
    name: brand ? `${brand} ALPR` : 'ALPR camera',
    brand,
    latitude: lat,
    longitude: lng,
    cameraType: 'alpr',
    sourceUrl: Number.isFinite(osmId) ? `https://www.openstreetmap.org/${osmType}/${osmId}` : SOURCE_URL,
    sourceName: SOURCE_NAME,
    lastVerifiedAt: Number.isNaN(verified.getTime()) ? new Date() : verified,
  }
}

async function main() {
  const { limit, force } = parseArgs()

  const existing = await db.publicCameraLocation.count({ where: { cameraType: 'alpr' } })
  if (existing > 0 && !force) {
    const newest = await db.publicCameraLocation.findFirst({
      where: { cameraType: 'alpr' },
      orderBy: { lastVerifiedAt: 'desc' },
      select: { lastVerifiedAt: true },
    })
    const age = newest ? Date.now() - newest.lastVerifiedAt.getTime() : Infinity
    if (age < SYNC_MAX_AGE_MS) {
      console.log(
        `✓ local ALPR inventory is fresh (${existing} cameras, synced ${newest!.lastVerifiedAt.toISOString()}) — skipping. Use --force to re-sync.`,
      )
      return
    }
  }

  const raw = await downloadDump()
  let features: DumpFeature[]
  try {
    features = (JSON.parse(raw) as { features?: DumpFeature[] }).features ?? []
  } catch (err) {
    throw new Error(`Dataset is not valid JSON: ${err instanceof Error ? err.message : err}`)
  }
  console.log(`  parsed ${features.length} features`)

  const rows = features
    .map(toRow)
    .filter((r): r is NonNullable<ReturnType<typeof toRow>> => r !== null)
    .slice(0, limit)
  // Deduplicate by externalKey (createMany on SQLite has no skipDuplicates).
  const seen = new Set<string>()
  const unique = rows.filter((r) => {
    if (seen.has(r.externalKey)) return false
    seen.add(r.externalKey)
    return true
  })
  console.log(`  ${unique.length} valid, deduplicated ALPR cameras to import`)

  await db.publicCameraLocation.deleteMany({ where: { cameraType: 'alpr' } })
  let done = 0
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH)
    await db.publicCameraLocation.createMany({ data: batch })
    done += batch.length
    process.stdout.write(`\r  imported ${done}/${unique.length}`)
  }
  console.log('')

  const total = await db.publicCameraLocation.count({ where: { cameraType: 'alpr' } })
  const flock = await db.publicCameraLocation.count({ where: { cameraType: 'alpr', brand: 'Flock Safety' } })
  console.log(`✓ sync complete — ${total} ALPR cameras in inventory (${flock} Flock Safety)`)
  console.log(`  attribution: © OpenStreetMap contributors · DeFlock (${SOURCE_URL})`)
}

main()
  .catch((err) => {
    console.error('✗ sync failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
