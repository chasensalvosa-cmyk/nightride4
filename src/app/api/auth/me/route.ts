// GET /api/auth/me — current session user (null when signed out).
// Sliding renewal: when the session has < 15 d left it is extended to a fresh
// 30 d and the cookie maxAge is refreshed, so an active rider never has to
// sign in "again and again".
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  SESSION_COOKIE,
  getCurrentUser,
  readSessionToken,
  renewSessionIfNeeded,
  sessionCookieOptions,
} from '@/lib/auth'
import { serializeSettings } from '@/lib/serialize'

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ user: null, settings: null })
  }
  const settings = await db.userSettings.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  })

  const res = NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
    },
    settings: serializeSettings(settings),
  })

  // Sliding session renewal (keeps the browser cookie and DB row in sync).
  const token = await readSessionToken()
  if (token) {
    const extendedTo = await renewSessionIfNeeded(token).catch(() => null)
    if (extendedTo) {
      const maxAge = Math.max(1, Math.ceil((extendedTo.getTime() - Date.now()) / 1000))
      res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge, req))
    }
  }
  return res
}
