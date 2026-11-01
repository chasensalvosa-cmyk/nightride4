// GET  /api/community/reports/[id]/comments — public comment thread
// POST /api/community/reports/[id]/comments — add a comment (auth required)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { serializeComment } from '@/lib/serialize'
import { commentCreateSchema } from '@/lib/validators'
import { broadcast } from '@/lib/realtime'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const report = await db.communityReport.findUnique({ where: { id } })
  if (!report || report.hidden) {
    return NextResponse.json({ error: 'Report not found.' }, { status: 404 })
  }
  const comments = await db.reportComment.findMany({
    where: { reportId: id, hidden: false },
    include: { user: { select: { username: true, avatarUrl: true } } },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
  return NextResponse.json({ comments: comments.map(serializeComment) })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in to comment.' }, { status: 401 })
  }
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const parsed = commentCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    )
  }

  const report = await db.communityReport.findUnique({ where: { id } })
  if (!report || report.hidden) {
    return NextResponse.json({ error: 'Report not found.' }, { status: 404 })
  }

  const comment = await db.reportComment.create({
    data: {
      reportId: id,
      userId: user.id,
      content: parsed.data.content,
    },
    include: { user: { select: { username: true, avatarUrl: true } } },
  })
  const serialized = serializeComment(comment)
  await broadcast('comment:new', { reportId: id, comment: serialized })
  return NextResponse.json({ comment: serialized }, { status: 201 })
}
