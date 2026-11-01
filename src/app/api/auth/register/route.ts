// POST /api/auth/register — create an account and open a session.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  SESSION_COOKIE,
  createSession,
  hashPassword,
  sessionCookieOptions,
  validatePassword,
  validateUsername,
} from '@/lib/auth'
import { registerSchema } from '@/lib/validators'

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    )
  }
  const { username, password } = parsed.data

  const usernameError = validateUsername(username)
  if (usernameError) return NextResponse.json({ error: usernameError }, { status: 400 })
  const passwordError = validatePassword(password)
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 })

  const existing = await db.profile.findUnique({ where: { username } })
  if (existing) {
    return NextResponse.json(
      { error: 'That username is already taken.' },
      { status: 409 },
    )
  }

  const passwordHash = await hashPassword(password)
  const profile = await db.profile.create({
    data: {
      id: crypto.randomUUID(),
      username,
      passwordHash,
      settings: { create: {} },
    },
  })

  const token = await createSession(profile.id)
  const res = NextResponse.json(
    {
      user: {
        id: profile.id,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        createdAt: profile.createdAt.toISOString(),
      },
    },
    { status: 201 },
  )
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions())
  return res
}
