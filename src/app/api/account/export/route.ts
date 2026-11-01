// GET /api/account/export — download all of the rider's own data (JSON).
// Privacy transparency: nothing is included that does not belong to the caller.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { serializeRide, serializeSavedLocation, serializeReport, serializeComment } from '@/lib/serialize'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
  }

  const [rides, locations, reports, comments, settings] = await Promise.all([
    db.ride.findMany({ where: { userId: user.id }, orderBy: { startedAt: 'desc' } }),
    db.savedLocation.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
    db.communityReport.findMany({
      where: { userId: user.id },
      include: { user: { select: { username: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    db.reportComment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    }),
    db.userSettings.findUnique({ where: { userId: user.id } }),
  ])

  const payload = {
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
    },
    rides: rides.map(serializeRide),
    savedLocations: locations.map(serializeSavedLocation),
    communityReports: reports.map((r) => serializeReport(r)),
    comments: comments.map((c) => serializeComment(c)),
    settings,
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="nightride-data-${user.username}.json"`,
    },
  })
}
