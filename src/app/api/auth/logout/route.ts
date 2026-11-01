// POST /api/auth/logout — destroy the current session.
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, destroySession, sessionCookieOptions } from '@/lib/auth'

export async function POST(req: Request) {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) {
    await destroySession(token).catch(() => undefined)
  }
  const res = NextResponse.json({ ok: true })
  // Clear with the same attributes the cookie was set with (iframe-safe).
  res.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0, req))
  return res
}
