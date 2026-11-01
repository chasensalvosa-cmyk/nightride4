'use client'

// NIGHTRIDE — shared "save location" dialog (map point details + saved page).
// Form fields live in an inner component that unmounts when the dialog
// closes, so every open starts fresh from the draft.

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { createSavedLocation } from '@/services/locations/savedLocationService'
import { SAVED_LOCATION_CATEGORIES, SAVED_LOCATION_CATEGORY_META } from '@/lib/categories'
import { formatCoordinate } from '@/lib/geo'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import type { SavedLocationCategory } from '@/types'

export interface SaveLocationDraft {
  lat: number
  lng: number
  label?: string
}

export function SaveLocationDialog({
  open,
  draft,
  onOpenChange,
}: {
  open: boolean
  draft: SaveLocationDraft | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (body: {
      name: string
      description: string
      category: SavedLocationCategory
    }) =>
      createSavedLocation({
        ...body,
        description: body.description || undefined,
        latitude: draft!.lat,
        longitude: draft!.lng,
      }),
    onSuccess: () => {
      toast.success('Location saved')
      void queryClient.invalidateQueries({ queryKey: ['saved-locations'] })
      onOpenChange(false)
    },
    onError: (err) => {
      toast.error('Could not save location', {
        description: err.message.includes('Sign in') ? 'You need an account first.' : err.message,
      })
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto scroll-slim border-border bg-panel sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Save location</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-text-secondary">
            Private to your account — visible on your map and in Saved.
          </DialogDescription>
        </DialogHeader>
        <SaveForm draft={draft} pending={mutation.isPending} onSubmit={(body) => mutation.mutate(body)} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function SaveForm({
  draft,
  pending,
  onSubmit,
  onCancel,
}: {
  draft: SaveLocationDraft | null
  pending: boolean
  onSubmit: (body: { name: string; description: string; category: SavedLocationCategory }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(draft?.label ?? '')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<SavedLocationCategory>('custom')

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-panel-2 px-3 py-2">
        <p className="label-micro">Coordinates</p>
        <p className="mt-1 text-xs text-foreground">
          {draft ? `${formatCoordinate(draft.lat, 'lat')} · ${formatCoordinate(draft.lng, 'lng')}` : '—'}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="loc-name" className="text-xs">Name</Label>
        <Input
          id="loc-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Battery Street viewpoint"
          maxLength={80}
          className="border-border bg-panel-2 text-xs"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Category</Label>
        <Select value={category} onValueChange={(v) => setCategory(v as SavedLocationCategory)}>
          <SelectTrigger className="border-border bg-panel-2 text-xs" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-border bg-popover">
            {SAVED_LOCATION_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c} className="text-xs">
                {SAVED_LOCATION_CATEGORY_META[c].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="loc-desc" className="text-xs">Description (optional)</Label>
        <Textarea
          id="loc-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Notes for future you…"
          maxLength={500}
          rows={3}
          className="resize-none border-border bg-panel-2 text-xs"
        />
      </div>
      <DialogFooter className="gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!draft || name.trim().length < 2 || pending}
          onClick={() => onSubmit({ name: name.trim(), description: description.trim(), category })}
        >
          {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
          Save
        </Button>
      </DialogFooter>
    </div>
  )
}
