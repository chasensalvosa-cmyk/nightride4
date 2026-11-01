// GET  /api/rides        — list the signed-in rider's rides (history)
// POST /api/rides        — start a new ride (GPS tracking is client-side;
//                          the server persists points pushed by the tracker)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { serializeRide } from '@/lib/serialize'
import { rideCreateSchema } from '@/lib/validators'

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in to view your rides.' }, { status: 401 })
  }
  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const rides = await db.ride.findMany({
    where: {
      userId: user.id,
      ...(status ? { status: status as 'active' | 'paused' | 'completed' } : {}),
    },
    orderBy: { startedAt: 'desc' },
    take: 100,
  })
  return NextResponse.json({ rides: rides.map(serializeRide) })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to start tracking rides.' },
      { status: 401 },
    )
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    /* empty body allowed */
  }
  const parsed = rideCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    )
  }

  // One live ride at a time: an unfinished session must be ended first.
  const existing = await db.ride.findFirst({
    where: { userId: user.id, status: { in: ['active', 'paused'] } },
  })
  if (existing) {
    return NextResponse.json(
      {
        error: 'You already have an unfinished ride. End or resume it first.',
        ride: serializeRide(existing),
      },
      { status: 409 },
    )
  }

  const ride = await db.ride.create({
    data: {
      userId: user.id,
      title: parsed.data.title ?? null,
      startedAt: parsed.data.startedAt ? new Date(parsed.data.startedAt) : new Date(),
      status: 'active',
      routeData: '[]',
    },
  })
  return NextResponse.json({ ride: serializeRide(ride) }, { status: 201 })
}
