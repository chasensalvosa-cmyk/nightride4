// GET  /api/community/reports — public feed with filters
//        ?category=road_hazard,construction  ?status=open  ?lat=&lng=&radius=
//        ?sort=recent|nearby  ?limit=  ?author=
// POST /api/community/reports — create a report (auth required)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { serializeReport } from '@/lib/serialize'
import { reportCreateSchema } from '@/lib/validators'
import { broadcast } from '@/lib/realtime'
import { REPORT_CATEGORIES, POLICE_ACTIVITY_TTL_MS } from '@/lib/validators'
import type { CommunityReport } from '@/types'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const categories = (url.searchParams.get('category') ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => (REPORT_CATEGORIES as readonly string[]).includes(c))
  const status = url.searchParams.get('status')
  const lat = Number.parseFloat(url.searchParams.get('lat') ?? '')
  const lng = Number.parseFloat(url.searchParams.get('lng') ?? '')
  const radius = Number.parseFloat(url.searchParams.get('radius') ?? '')
  const sort = url.searchParams.get('sort') === 'nearby' ? 'nearby' : 'recent'
  const limit = Math.min(
    Math.max(Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 1),
    200,
  )
  const author = url.searchParams.get('author')

  const hasRef = Number.isFinite(lat) && Number.isFinite(lng)
  const where = {
    hidden: false,
    // Transient sightings (police activity) disappear once expired.
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    ...(categories.length > 0 ? { category: { in: categories } } : {}),
    ...(status && ['open', 'resolved', 'closed'].includes(status) ? { status } : {}),
    ...(author ? { user: { username: author } } : {}),
  }

  const reports = await db.communityReport.findMany({
    where,
    include: {
      user: { select: { username: true, avatarUrl: true } },
      _count: {
        select: {
          confirmations: true,
          comments: { where: { hidden: false } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: sort === 'nearby' && hasRef ? 200 : limit,
  })

  let serialized: CommunityReport[] = reports.map((r) =>
    serializeReport(r, hasRef ? lat : undefined, hasRef ? lng : undefined),
  )

  if (hasRef && Number.isFinite(radius)) {
    serialized = serialized.filter(
      (r) => (r.distanceMeters ?? Infinity) <= radius,
    )
  }
  if (sort === 'nearby' && hasRef) {
    serialized.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))
  }

  return NextResponse.json({ reports: serialized.slice(0, limit) })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to submit community reports.' },
      { status: 401 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const parsed = reportCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    )
  }

  const report = await db.communityReport.create({
    data: {
      userId: user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      locationLabel: parsed.data.locationLabel ?? null,
      // Police sightings are transient — they auto-expire so the map never
      // shows stale enforcement positions.
      ...(parsed.data.category === 'police_activity'
        ? { expiresAt: new Date(Date.now() + POLICE_ACTIVITY_TTL_MS) }
        : {}),
    },
    include: {
      user: { select: { username: true, avatarUrl: true } },
      _count: { select: { confirmations: true, comments: { where: { hidden: false } } } },
    },
  })

  const serialized = serializeReport(report)
  await broadcast('report:new', serialized)
  return NextResponse.json({ report: serialized }, { status: 201 })
}

export const dynamic = 'force-dynamic'
