// POST   /api/community/reports/[id]/confirmations — confirm a report (auth)
// DELETE /api/community/reports/[id]/confirmations — withdraw a confirmation
// A report reaches verification_status=confirmed at 2+ distinct confirmations.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { broadcast } from '@/lib/realtime'

const CONFIRM_THRESHOLD = 2

async function refreshVerification(reportId: string): Promise<void> {
  const [report, count] = await Promise.all([
    db.communityReport.findUnique({ where: { id: reportId } }),
    db.reportConfirmation.count({ where: { reportId } }),
  ])
  if (!report) return
  const verificationStatus =
    count >= CONFIRM_THRESHOLD ? 'confirmed' : 'unverified'
  if (verificationStatus !== report.verificationStatus) {
    await db.communityReport.update({
      where: { id: reportId },
      data: { verificationStatus },
    })
    await broadcast('report:updated', {
      id: reportId,
      status: report.status,
      verificationStatus,
      updatedAt: new Date().toISOString(),
    })
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in to confirm reports.' }, { status: 401 })
  }
  const { id } = await params
  const report = await db.communityReport.findUnique({ where: { id } })
  if (!report || report.hidden) {
    return NextResponse.json({ error: 'Report not found.' }, { status: 404 })
  }
  if (report.userId === user.id) {
    return NextResponse.json(
      { error: 'You cannot confirm your own report.' },
      { status: 403 },
    )
  }

  await db.reportConfirmation.upsert({
    where: { reportId_userId: { reportId: id, userId: user.id } },
    update: {},
    create: { reportId: id, userId: user.id },
  })
  await refreshVerification(id)
  const confirmations = await db.reportConfirmation.count({ where: { reportId: id } })
  return NextResponse.json({ confirmed: true, confirmationCount: confirmations })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
  }
  const { id } = await params
  await db.reportConfirmation.deleteMany({
    where: { reportId: id, userId: user.id },
  })
  await refreshVerification(id)
  const confirmations = await db.reportConfirmation.count({ where: { reportId: id } })
  return NextResponse.json({ confirmed: false, confirmationCount: confirmations })
}
