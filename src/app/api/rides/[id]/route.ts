// GET    /api/rides/[id] — ride detail (owner only; rides are private)
// PATCH  /api/rides/[id] — pause / resume / complete + append GPS points
// DELETE /api/rides/[id] — delete a ride
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { serializeRide } from '@/lib/serialize'
import { rideUpdateSchema } from '@/lib/validators'
import type { TrackPoint } from '@/types'

const MAX_POINTS = 20000 // hard cap on persisted track size

function parseRoute(raw: string): TrackPoint[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? (parsed as TrackPoint[]) : []
  } catch {
    return []
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
  const { id } = await params
  const ride = await db.ride.findUnique({ where: { id } })
  if (!ride || ride.userId !== user.id) {
    return NextResponse.json({ error: 'Ride not found.' }, { status: 404 })
  }
  return NextResponse.json({ ride: serializeRide(ride) })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const parsed = rideUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    )
  }

  const ride = await db.ride.findUnique({ where: { id } })
  if (!ride || ride.userId !== user.id) {
    return NextResponse.json({ error: 'Ride not found.' }, { status: 404 })
  }
  if (ride.status === 'completed') {
    return NextResponse.json({ error: 'This ride is already completed.' }, { status: 409 })
  }

  const d = parsed.data
  const route = parseRoute(ride.routeData)
  const nextRoute =
    d.appendPoints && d.appendPoints.length > 0
      ? [...route, ...d.appendPoints].slice(-MAX_POINTS)
      : route

  const updated = await db.ride.update({
    where: { id },
    data: {
      ...(d.status ? { status: d.status } : {}),
      ...(d.title !== undefined ? { title: d.title } : {}),
      ...(d.endedAt ? { endedAt: new Date(d.endedAt) } : {}),
      ...(d.durationSeconds !== undefined ? { durationSeconds: d.durationSeconds } : {}),
      ...(d.distanceMeters !== undefined ? { distanceMeters: d.distanceMeters } : {}),
      ...(d.averageSpeed !== undefined ? { averageSpeed: d.averageSpeed } : {}),
      ...(d.maximumSpeed !== undefined ? { maximumSpeed: d.maximumSpeed } : {}),
      routeData: JSON.stringify(nextRoute),
    },
  })
  return NextResponse.json({ ride: serializeRide(updated) })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
  const { id } = await params
  const ride = await db.ride.findUnique({ where: { id } })
  if (!ride || ride.userId !== user.id) {
    return NextResponse.json({ error: 'Ride not found.' }, { status: 404 })
  }
  await db.ride.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
