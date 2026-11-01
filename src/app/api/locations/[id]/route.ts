// PATCH  /api/locations/[id] — rename / recategorize a saved location (owner)
// DELETE /api/locations/[id] — delete a saved location (owner)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { serializeSavedLocation } from '@/lib/serialize'
import { savedLocationCreateSchema } from '@/lib/validators'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
  const { id } = await params

  const existing = await db.savedLocation.findUnique({ where: { id } })
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: 'Location not found.' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const parsed = savedLocationCreateSchema.partial().safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    )
  }

  const updated = await db.savedLocation.update({
    where: { id },
    data: parsed.data,
  })
  return NextResponse.json({ location: serializeSavedLocation(updated) })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
  const { id } = await params
  const existing = await db.savedLocation.findUnique({ where: { id } })
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: 'Location not found.' }, { status: 404 })
  }
  await db.savedLocation.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
