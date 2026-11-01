// PATCH /api/profile — update the signed-in rider's profile (username, avatar).
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, validateUsername } from '@/lib/auth'
import { profileUpdateSchema } from '@/lib/validators'

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
  const parsed = profileUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    )
  }

  if (parsed.data.username && parsed.data.username !== user.username) {
    const err = validateUsername(parsed.data.username)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
    const clash = await db.profile.findUnique({
      where: { username: parsed.data.username },
    })
    if (clash) {
      return NextResponse.json({ error: 'That username is taken.' }, { status: 409 })
    }
  }

  const updated = await db.profile.update({
    where: { id: user.id },
    data: {
      ...(parsed.data.username ? { username: parsed.data.username } : {}),
      ...(parsed.data.avatarUrl !== undefined ? { avatarUrl: parsed.data.avatarUrl } : {}),
    },
  })

  return NextResponse.json({
    user: {
      id: updated.id,
      username: updated.username,
      avatarUrl: updated.avatarUrl,
      createdAt: updated.createdAt.toISOString(),
    },
  })
}
