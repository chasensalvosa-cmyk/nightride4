'use client'

// NIGHTRIDE — report submission sheet (map and community pages).
// Requires an account; coordinates are real (map click / GPS / manual).

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { createReport } from '@/services/community/communityService'
import { REPORT_CATEGORIES, REPORT_CATEGORY_META } from '@/lib/categories'
import { formatCoordinate } from '@/lib/geo'
import { AuthGate } from '@/components/shared/panels'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/hooks/use-auth'
import type { ReportCategory } from '@/types'

export interface ReportDraft {
  lat: number
  lng: number
  label?: string
}

export function ReportSheet({
  open,
  draft,
  onOpenChange,
}: {
  open: boolean
  draft: ReportDraft | null
  onOpenChange: (open: boolean) => void
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<ReportCategory>('road_hazard')
  const [description, setDescription] = useState('')
  const [locationLabel, setLocationLabel] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      createReport({
        title: title.trim(),
        description: description.trim(),
        category,
        latitude: draft!.lat,
        longitude: draft!.lng,
        locationLabel: (locationLabel.trim() || draft?.label || undefined) as string | undefined,
      }),
    onSuccess: () => {
      toast.success('Report submitted', {
        description: 'Thanks — the community sees it on the map immediately.',
      })
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
      void queryClient.invalidateQueries({ queryKey: ['map-reports'] })
      onOpenChange(false)
      setTitle('')
      setDescription('')
      setLocationLabel('')
      setCategory('road_hazard')
    },
    onError: (err) => {
      toast.error('Could not submit report', { description: err.message })
    },
  })

  const canSubmit =
    title.trim().length >= 4 && description.trim().length >= 10 && !!draft && !mutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto scroll-slim border-border bg-panel sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Submit a report</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-text-secondary">
            Help other riders avoid hazards and find good roads. Reports are public and attributed to
            your username.
          </DialogDescription>
        </DialogHeader>

        {!user ? (
          <AuthGate feature="submit community reports" />
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-panel-2 px-3 py-2">
              <p className="label-micro">Approximate location</p>
              <p className="mt-1 text-xs text-foreground">
                {draft
                  ? `${formatCoordinate(draft.lat, 'lat')} · ${formatCoordinate(draft.lng, 'lng')}`
                  : 'Pick a point on the map first.'}
              </p>
              {draft?.label && <p className="mt-0.5 text-[11px] text-text-muted">{draft.label}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="report-title" className="text-xs">Title</Label>
              <Input
                id="report-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Deep pothole on the right lane"
                maxLength={120}
                className="border-border bg-panel-2 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ReportCategory)}>
                <SelectTrigger className="border-border bg-panel-2 text-xs" aria-label="Category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover">
                  {REPORT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">
                      {REPORT_CATEGORY_META[c].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] leading-relaxed text-text-muted">
                {REPORT_CATEGORY_META[category].description}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="report-desc" className="text-xs">Description</Label>
              <Textarea
                id="report-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What should other riders know? (lane, severity, best avoid route…)"
                maxLength={2000}
                rows={4}
                className="resize-none border-border bg-panel-2 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="report-loc" className="text-xs">Location label (optional)</Label>
              <Input
                id="report-loc"
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
                placeholder={draft?.label ?? 'e.g. Alaskan Way & Vine St'}
                maxLength={160}
                className="border-border bg-panel-2 text-xs"
              />
            </div>

            <DialogFooter className="gap-2">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!canSubmit} onClick={() => mutation.mutate()}>
                {mutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                Submit report
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
