'use client'

// NIGHTRIDE — abuse flag dialog (reports and comments).

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Flag, Loader2 } from 'lucide-react'
import { flagAbuse } from '@/services/community/communityService'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

export function FlagDialog({
  open,
  onOpenChange,
  itemType,
  itemId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemType: 'report' | 'comment'
  itemId: string | null
}) {
  const [reason, setReason] = useState('')

  const mutation = useMutation({
    mutationFn: () => flagAbuse(itemType, itemId!, reason.trim()),
    onSuccess: () => {
      toast.success('Reported — thank you', {
        description: 'Our moderation queue reviews flags. 3 distinct flags hide an item automatically.',
      })
      onOpenChange(false)
      setReason('')
    },
    onError: (err) => {
      toast.error('Could not submit flag', { description: err.message })
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-panel sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Flag className="h-4 w-4 text-status-warning" aria-hidden /> Report abuse
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-text-secondary">
            Tell us what is wrong with this {itemType}. Flags are private; three distinct flags
            automatically hide the item for review.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. spam, dangerous advice, harassment, false location…"
          rows={3}
          maxLength={300}
          className="resize-none border-border bg-panel-2 text-xs"
          aria-label="Reason"
        />
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!itemId || reason.trim().length < 3 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
            Submit flag
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
