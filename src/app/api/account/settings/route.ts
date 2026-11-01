// GET   /api/account/settings — read settings
// PATCH /api/account/settings — update privacy / notification / map settings
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { serializeSettings } from '@/lib/serialize'
import { settingsUpdateSchema } from '@/lib/validators'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
  }
  const settings = await db.userSettings.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  })
  return NextResponse.json({ settings: serializeSettings(settings) })
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const parsed = settingsUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    )
  }
  const settings = await db.userSettings.upsert({
    where: { userId: user.id },
    update: parsed.data,
    create: { userId: user.id, ...parsed.data },
  })
  return NextResponse.json({ settings: serializeSettings(settings) })
}
