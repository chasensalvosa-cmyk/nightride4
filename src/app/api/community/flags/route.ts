// POST /api/community/flags — report abuse on a report or comment (auth).
// { itemType: 'report' | 'comment', itemId, reason }
// Community moderation: 3+ distinct flags auto-hide the item pending review.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { flagCreateSchema } from '@/lib/validators'

const AUTO_HIDE_THRESHOLD = 3

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in to report abuse.' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const itemType = body.itemType === 'comment' ? 'comment' : body.itemType === 'report' ? 'report' : null
  const itemId = typeof body.itemId === 'string' ? body.itemId : null
  if (!itemType || !itemId) {
    return NextResponse.json(
      { error: 'itemType ("report"|"comment") and itemId are required.' },
      { status: 400 },
    )
  }
  const parsed = flagCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'A reason is required.' },
      { status: 400 },
    )
  }

  const targetExists =
    itemType === 'report'
      ? (await db.communityReport.findUnique({ where: { id: itemId } })) !== null
      : (await db.reportComment.findUnique({ where: { id: itemId } })) !== null
  if (!targetExists) {
    return NextResponse.json({ error: 'Item not found.' }, { status: 404 })
  }

  await db.abuseFlag.upsert({
    where: { itemType_itemId_userId: { itemType, itemId, userId: user.id } },
    update: {},
    create: { itemType, itemId, userId: user.id, reason: parsed.data.reason },
  })

  const flagCount = await db.abuseFlag.count({ where: { itemType, itemId } })
  if (flagCount >= AUTO_HIDE_THRESHOLD) {
    if (itemType === 'report') {
      await db.communityReport.updateMany({ where: { id: itemId }, data: { hidden: true } })
    } else {
      await db.reportComment.updateMany({ where: { id: itemId }, data: { hidden: true } })
    }
  }

  return NextResponse.json({ ok: true, flagCount }, { status: 201 })
}
