// GET  /api/locations — the signed-in rider's saved locations
// POST /api/locations — save a location
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { serializeSavedLocation } from '@/lib/serialize'
import { savedLocationCreateSchema } from '@/lib/validators'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to view your saved locations.' },
      { status: 401 },
    )
  }
  const locations = await db.savedLocation.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ locations: locations.map(serializeSavedLocation) })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to save locations.' },
      { status: 401 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const parsed = savedLocationCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    )
  }

  const count = await db.savedLocation.count({ where: { userId: user.id } })
  if (count >= 200) {
    return NextResponse.json(
      { error: 'Saved location limit reached (200).' },
      { status: 409 },
    )
  }

  const location = await db.savedLocation.create({
    data: { userId: user.id, ...parsed.data },
  })
  return NextResponse.json({ location: serializeSavedLocation(location) }, { status: 201 })
}
