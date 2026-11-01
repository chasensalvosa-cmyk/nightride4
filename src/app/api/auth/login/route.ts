// POST /api/auth/login — verify credentials and open a session.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  SESSION_COOKIE,
  createSession,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/auth'
import { loginSchema } from '@/lib/validators'

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 })
  }

  const profile = await db.profile.findUnique({
    where: { username: parsed.data.username },
  })
  if (!profile || !(await verifyPassword(parsed.data.password, profile.passwordHash))) {
    return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 })
  }

  const token = await createSession(profile.id)
  const res = NextResponse.json({
    user: {
      id: profile.id,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      createdAt: profile.createdAt.toISOString(),
    },
  })
  // req-aware attributes: SameSite=None; Secure over HTTPS so the session
  // survives being loaded inside the preview iframe.
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(undefined, req))
  return res
}
