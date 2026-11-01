'use client'

// NIGHTRIDE — community page: submit, browse, filter, detail threads.

import { Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Crosshair, Plus } from 'lucide-react'
import { fetchReports } from '@/services/community/communityService'
import { ReportFilters, ReportCard } from '@/components/community/report-list'
import { ReportDetailDialog } from '@/components/community/report-detail'
import { ReportSheet, type ReportDraft } from '@/components/map/ReportSheet'
import { FlagDialog } from '@/components/shared/flag-dialog'
import { EmptyState, LoadingRows, Panel } from '@/components/shared/panels'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { useGeolocation } from '@/hooks/use-geolocation'
import { useRealtime } from '@/hooks/use-realtime'
import { useMapStore } from '@/stores/map-store'
import type { CommunityReport, ReportCategory } from '@/types'

function CommunityContent() {
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const mapView = useMapStore((s) => s.view)
  const geo = useGeolocation({ auto: false })

  const [categories, setCategories] = useState<ReportCategory[]>([])
  const [status, setStatus] = useState<'all' | 'open' | 'resolved'>('all')
  const [sort, setSort] = useState<'recent' | 'nearby'>('recent')
  const [detailOverride, setDetailOverride] = useState<{ id: string | null } | null>(null)
  const detailId = detailOverride ? detailOverride.id : searchParams.get('report')
  const [reportOpen, setReportOpen] = useState(false)
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null)
  const [flagId, setFlagId] = useState<string | null>(null)
  const [flagOpen, setFlagOpen] = useState(false)

  const canSortNearby = geo.permission === 'granted'
  const ref = geo.coords ?? null

  const reportsQuery = useQuery({
    queryKey: [
      'reports',
      'community',
      categories.join(','),
      status,
      sort,
      ref ? `${ref.lat.toFixed(3)}:${ref.lng.toFixed(3)}` : 'noref',
    ],
    queryFn: () =>
      fetchReports({
        categories: categories.length ? categories : undefined,
        status: status === 'all' ? undefined : status,
        lat: ref?.lat,
        lng: ref?.lng,
        sort,
        limit: 60,
      }),
    staleTime: 30_000,
  })

  useRealtime({
    onReportNew: () => void queryClient.invalidateQueries({ queryKey: ['reports'] }),
    onReportUpdated: () => void queryClient.invalidateQueries({ queryKey: ['reports'] }),
    onCommentNew: () => void queryClient.invalidateQueries({ queryKey: ['reports'] }),
  })

  const reports = useMemo(() => reportsQuery.data?.reports ?? [], [reportsQuery.data])

  const openNewReport = async () => {
    if (!user) {
      toast.error('Sign in to submit reports', {
        description: 'A free account keeps the community accountable.',
      })
      return
    }
    let draft: ReportDraft = { lat: mapView.lat, lng: mapView.lng }
    if (geo.permission !== 'granted') {
      const fix = await geo.requestOnce()
      if (fix) draft = { lat: fix.lat, lng: fix.lng }
    } else if (geo.coords) {
      draft = { lat: geo.coords.lat, lng: geo.coords.lng }
    }
    setReportDraft(draft)
    setReportOpen(true)
  }

  const toggleCategory = (c: ReportCategory) =>
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Community</h1>
          <p className="mt-0.5 text-xs text-text-secondary">
            Rider-reported road conditions, closures, charging spots and safety — verified by confirmations.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            onClick={() => {
              if (geo.permission === 'granted') {
                geo.requestOnce().then(() => setSort('nearby'))
              } else {
                geo.requestOnce().then((fix) => {
                  if (fix) setSort('nearby')
                  else toast.error('Location unavailable', { description: geo.error ?? 'Permission denied.' })
                })
              }
            }}
          >
            <Crosshair className="h-3.5 w-3.5" aria-hidden />
            {canSortNearby ? 'Using my position' : 'Use my position'}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={openNewReport}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New report
          </Button>
        </div>
      </div>

      <Panel className="p-4">
        <ReportFilters
          activeCategories={categories}
          onToggleCategory={toggleCategory}
          status={status}
          onStatusChange={setStatus}
          sort={sort}
          onSortChange={setSort}
          canSortNearby={canSortNearby}
        />
      </Panel>

      {reportsQuery.isLoading ? (
        <Panel>
          <LoadingRows rows={5} />
        </Panel>
      ) : reports.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Plus}
            title={categories.length ? 'No reports match these filters' : 'No reports yet'}
            description={
              categories.length
                ? 'Try clearing a filter or switching category chips.'
                : 'Be the first to report a hazard, closure or great riding spot.'
            }
            actionLabel="New report"
            onAction={openNewReport}
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {reports.map((r: CommunityReport) => (
            <ReportCard key={r.id} report={r} onOpen={(rep) => setDetailOverride({ id: rep.id })} />
          ))}
        </div>
      )}
      <p className="pb-2 text-center text-[10px] text-text-muted">
        Community reports are user-generated. Confirmations from distinct riders mark a report
        verified; abuse flags hide content after review.
      </p>

      <ReportDetailDialog
        reportId={detailId}
        onOpenChange={(open) => {
          if (!open) setDetailOverride({ id: null })
        }}
        onFlag={(id) => {
          setFlagId(id)
          setFlagOpen(true)
        }}
      />
      <ReportSheet open={reportOpen} draft={reportDraft} onOpenChange={setReportOpen} />
      <FlagDialog open={flagOpen} onOpenChange={setFlagOpen} itemType="report" itemId={flagId} />
    </div>
  )
}

export default function CommunityPage() {
  return (
    <Suspense fallback={null}>
      <CommunityContent />
    </Suspense>
  )
}
