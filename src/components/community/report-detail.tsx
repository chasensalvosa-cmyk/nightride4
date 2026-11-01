'use client'

// NIGHTRIDE — report detail dialog: full info, comments thread, confirm,
// resolve/reopen, close (author), delete (author), abuse flag.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, Loader2, Send, ShieldCheck } from 'lucide-react'
import {
  addComment,
  confirmReport,
  deleteReport,
  fetchComments,
  fetchReport,
  updateReportStatus,
} from '@/services/community/communityService'
import { CategoryBadge, AuthGate } from '@/components/shared/panels'
import { RelativeTime } from '@/components/shared/status'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/use-auth'
import type { CommunityReport } from '@/types'

export function ReportDetailDialog({
  reportId,
  onOpenChange,
  onFlag,
}: {
  reportId: string | null
  onOpenChange: (open: boolean) => void
  onFlag: (id: string) => void
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')

  const reportQuery = useQuery({
    queryKey: ['report', reportId],
    queryFn: () => fetchReport(reportId!),
    enabled: !!reportId,
  })
  const commentsQuery = useQuery({
    queryKey: ['report-comments', reportId],
    queryFn: () => fetchComments(reportId!),
    enabled: !!reportId,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['report', reportId] })
    void queryClient.invalidateQueries({ queryKey: ['reports'] })
    void queryClient.invalidateQueries({ queryKey: ['map-reports'] })
  }

  const confirmMutation = useMutation({
    mutationFn: (id: string) => confirmReport(id),
    onSuccess: (res) => {
      toast.success(`Confirmed — ${res.confirmationCount} total`)
      invalidate()
    },
    onError: (err) => {
      toast.error('Could not confirm', {
        description: err.message.includes('Sign in') ? 'Sign in to confirm reports.' : err.message,
      })
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'open' | 'resolved' | 'closed' }) =>
      updateReportStatus(id, status),
    onSuccess: () => {
      toast.success('Status updated')
      invalidate()
    },
    onError: (err) => toast.error('Could not update status', { description: err.message }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteReport(id),
    onSuccess: () => {
      toast.success('Report deleted')
      invalidate()
      onOpenChange(false)
    },
    onError: (err) => toast.error('Could not delete', { description: err.message }),
  })

  const commentMutation = useMutation({
    mutationFn: () => addComment(reportId!, comment.trim()),
    onSuccess: () => {
      setComment('')
      void queryClient.invalidateQueries({ queryKey: ['report-comments', reportId] })
      void queryClient.invalidateQueries({ queryKey: ['report', reportId] })
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
    onError: (err) =>
      toast.error('Could not comment', {
        description: err.message.includes('Sign in') ? 'Sign in to comment.' : err.message,
      }),
  })

  const report = reportQuery.data?.report
  const isAuthor = !!report && !!user && report.userId === user.id

  return (
    <Dialog open={!!reportId} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto scroll-slim border-border bg-panel sm:max-w-xl">
        {reportQuery.isLoading || !report ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-text-muted" aria-hidden />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CategoryBadge category={report.category} />
                {report.verificationStatus === 'confirmed' && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-status-success/30 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-status-success">
                    <ShieldCheck className="h-3 w-3" aria-hidden /> Verified by riders
                  </span>
                )}
                <span className="rounded-md border border-border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-text-muted">
                  {report.status}
                </span>
              </div>
              <DialogTitle className="text-left text-sm font-semibold leading-snug">
                {report.title}
              </DialogTitle>
              <DialogDescription className="text-left text-xs leading-relaxed text-text-secondary">
                {report.description}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border border-border bg-panel-2 px-3 py-2 text-[11px] text-text-secondary">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  By <span className="font-medium text-foreground">{report.author?.username ?? 'unknown'}</span>
                  {' · '}
                  <RelativeTime iso={report.createdAt} />
                </span>
                <span className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" aria-hidden /> {report.confirmationCount} confirmations
                  </span>
                  <a
                    href={`/map?lat=${report.latitude}&lng=${report.longitude}&zoom=15&layers=road_hazards`}
                    className="underline-offset-2 hover:underline"
                  >
                    View on map ↗
                  </a>
                </span>
              </div>
              {report.locationLabel && (
                <p className="mt-1 text-[10px] text-text-muted">{report.locationLabel}</p>
              )}
            </div>

            {/* actions */}
            <div className="flex flex-wrap gap-2">
              {user ? (
                <>
                  {report.userId !== user.id && report.status === 'open' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={confirmMutation.isPending}
                      onClick={() => confirmMutation.mutate(report.id)}
                    >
                      {confirmMutation.isPending && (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                      )}
                      Confirm this report
                    </Button>
                  )}
                  {report.status === 'open' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ id: report.id, status: 'resolved' })}
                    >
                      Mark resolved
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ id: report.id, status: 'open' })}
                    >
                      Reopen
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => onFlag(report.id)}>
                    Report abuse
                  </Button>
                  {isAuthor && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ id: report.id, status: 'closed' })}
                      >
                        Close
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-status-danger hover:text-status-danger"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (window.confirm('Delete this report permanently?')) {
                            deleteMutation.mutate(report.id)
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-text-muted">
                  Sign in to confirm, comment and update reports.
                </p>
              )}
            </div>

            {/* comments */}
            <div className="space-y-3">
              <p className="label-micro">Comments ({commentsQuery.data?.comments.length ?? 0})</p>
              {commentsQuery.isLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-text-muted" aria-hidden />
                </div>
              ) : (commentsQuery.data?.comments ?? []).length === 0 ? (
                <p className="text-xs text-text-muted">No comments yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {commentsQuery.data?.comments.map((c) => (
                    <li key={c.id} className="rounded-md border border-border bg-panel-2 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-foreground">
                          {c.author?.username ?? 'unknown'}
                        </span>
                        <RelativeTime iso={c.createdAt} />
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-text-secondary">{c.content}</p>
                    </li>
                  ))}
                </ul>
              )}

              {user ? (
                <div className="flex items-end gap-2">
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add context, updates or a thanks…"
                    rows={2}
                    maxLength={1000}
                    className="resize-none border-border bg-panel-2 text-xs"
                    aria-label="New comment"
                  />
                  <Button
                    size="sm"
                    className="h-9"
                    disabled={comment.trim().length < 2 || commentMutation.isPending}
                    onClick={() => commentMutation.mutate()}
                    aria-label="Send comment"
                  >
                    {commentMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Send className="h-3.5 w-3.5" aria-hidden />
                    )}
                  </Button>
                </div>
              ) : (
                <AuthGate feature="join the discussion" />
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
