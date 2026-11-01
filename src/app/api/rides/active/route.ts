// GET /api/rides/active — the rider's live/paused session (null when none).
// Used to recover tracking state after a page refresh.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { serializeRide } from '@/lib/serialize'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in to view your rides.' }, { status: 401 })
  }
  const ride = await db.ride.findFirst({
    where: { userId: user.id, status: { in: ['active', 'paused'] } },
    orderBy: { startedAt: 'desc' },
  })
  return NextResponse.json({ ride: ride ? serializeRide(ride) : null })
}
