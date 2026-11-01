// POST /api/account/delete — permanently delete the account and all owned
// data (rides, saved locations, reports, comments, confirmations, sessions).
// Requires the current password to be re-supplied for confirmation.
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import {
  SESSION_COOKIE,
  destroySession,
  getCurrentUser,
  verifyPassword,
} from '@/lib/auth'

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const password = typeof body.password === 'string' ? body.password : ''
  const full = await db.profile.findUnique({ where: { id: user.id } })
  if (!full || !(await verifyPassword(password, full.passwordHash))) {
    return NextResponse.json(
      { error: 'Password confirmation failed.' },
      { status: 403 },
    )
  }

  await db.profile.delete({ where: { id: user.id } }) // cascades to all owned data

  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) await destroySession(token).catch(() => undefined)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
