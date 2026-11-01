// GET    /api/community/reports/[id] — public report detail
// PATCH  /api/community/reports/[id] — update status (resolve / reopen / close)
//                                          author may close; any signed-in rider
//                                          may mark resolved or reopen (community moderation)
// DELETE /api/community/reports/[id] — author only
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { serializeReport } from '@/lib/serialize'
import { reportUpdateSchema } from '@/lib/validators'
import { broadcast } from '@/lib/realtime'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const report = await db.communityReport.findUnique({
    where: { id },
    include: {
      user: { select: { username: true, avatarUrl: true } },
      _count: { select: { confirmations: true, comments: { where: { hidden: false } } } },
    },
  })
  if (!report || report.hidden) {
    return NextResponse.json({ error: 'Report not found.' }, { status: 404 })
  }
  return NextResponse.json({ report: serializeReport(report) })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in to update reports.' }, { status: 401 })
  }
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const parsed = reportUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid status value.' }, { status: 400 })
  }

  const report = await db.communityReport.findUnique({ where: { id } })
  if (!report || report.hidden) {
    return NextResponse.json({ error: 'Report not found.' }, { status: 404 })
  }

  // Closing is reserved for the author; resolving/reopening is a community action.
  if (parsed.data.status === 'closed' && report.userId !== user.id) {
    return NextResponse.json(
      { error: 'Only the author can close this report.' },
      { status: 403 },
    )
  }

  const updated = await db.communityReport.update({
    where: { id },
    data: { status: parsed.data.status ?? report.status },
    include: {
      user: { select: { username: true, avatarUrl: true } },
      _count: { select: { confirmations: true, comments: { where: { hidden: false } } } },
    },
  })
  await broadcast('report:updated', {
    id: updated.id,
    status: updated.status,
    verificationStatus: updated.verificationStatus,
    updatedAt: updated.updatedAt.toISOString(),
  })
  return NextResponse.json({ report: serializeReport(updated) })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
  const { id } = await params
  const report = await db.communityReport.findUnique({ where: { id } })
  if (!report || report.userId !== user.id) {
    return NextResponse.json({ error: 'Report not found.' }, { status: 404 })
  }
  await db.communityReport.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
