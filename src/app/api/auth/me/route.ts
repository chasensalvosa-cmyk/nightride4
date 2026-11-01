// GET /api/auth/me — current session user (null when signed out).
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { serializeSettings } from '@/lib/serialize'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ user: null, settings: null })
  }
  const settings = await db.userSettings.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  })
  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
    },
    settings: serializeSettings(settings),
  })
}
