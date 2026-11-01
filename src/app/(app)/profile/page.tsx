'use client'

// NIGHTRIDE — profile: identity, avatar, lifetime stats from real data.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Pencil, Route } from 'lucide-react'
import { api } from '@/lib/api-client'
import { fetchRides } from '@/services/rides/rideService'
import { fetchReports } from '@/services/community/communityService'
import { AuthGate, Panel, SectionHeader } from '@/components/shared/panels'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDistance, formatDuration } from '@/lib/geo'
import type { SessionUser } from '@/types'

export default function ProfilePage() {
  const { user, loading } = useAuth()
  const signedIn = !!user && !loading

  if (!signedIn) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 lg:p-6">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Profile</h1>
        <Panel>
          <SectionHeader label="Rider profile" icon={Pencil} />
          <AuthGate feature="view your profile" />
        </Panel>
      </div>
    )
  }

  return <ProfileContent user={user!} />
}

function ProfileContent({ user: initialUser }: { user: SessionUser }) {
  const queryClient = useQueryClient()
  const [username, setUsername] = useState(initialUser.username)
  const [avatarUrl, setAvatarUrl] = useState(initialUser.avatarUrl ?? '')
  const [editing, setEditing] = useState(false)

  const ridesQuery = useQuery({
    queryKey: ['rides', 'profile'],
    queryFn: () => fetchRides('completed'),
    staleTime: 30_000,
  })
  const reportsQuery = useQuery({
    queryKey: ['reports', 'mine'],
    queryFn: () => fetchReports({ limit: 100 }),
    staleTime: 30_000,
  })

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, string | null> = {}
      if (username.trim() !== initialUser.username) body.username = username.trim()
      if (avatarUrl.trim() !== (initialUser.avatarUrl ?? '')) body.avatarUrl = avatarUrl.trim() || null
      return api.patch('/api/profile', body)
    },
    onSuccess: () => {
      toast.success('Profile updated')
      setEditing(false)
      void queryClient.invalidateQueries({ queryKey: ['rides'] })
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
    onError: (err) => toast.error('Could not update profile', { description: err.message }),
  })

  const rides = ridesQuery.data?.rides ?? []
  const myReports = (reportsQuery.data?.reports ?? []).filter((r) => r.userId === initialUser.id)
  const totalDistance = rides.reduce((a, r) => a + r.distanceMeters, 0)
  const totalDuration = rides.reduce((a, r) => a + r.durationSeconds, 0)

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 lg:p-6">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">Profile</h1>

      <Panel>
        <SectionHeader
          label="Identity"
          icon={Pencil}
          action={
            !editing ? (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] uppercase tracking-wider" onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : undefined
          }
        />
        <div className="px-4 pb-4">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-border bg-panel-2 text-base font-semibold uppercase text-foreground">
              {initialUser.avatarUrl ? (
                <img src={initialUser.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                initialUser.username.slice(0, 2)
              )}
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">{initialUser.username}</p>
              <p className="mt-0.5 text-[11px] text-text-muted">
                Riding with NIGHTRIDE since {new Date(initialUser.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {editing && (
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pf-username" className="text-xs">Username</Label>
                <Input
                  id="pf-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={20}
                  className="border-border bg-panel-2 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-avatar" className="text-xs">Avatar URL (optional)</Label>
                <Input
                  id="pf-avatar"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://…"
                  className="border-border bg-panel-2 text-xs"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={saveMutation.isPending || (username.trim().length < 3)}
                  onClick={() => saveMutation.mutate()}
                >
                  {saveMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                  Save changes
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false)
                    setUsername(initialUser.username)
                    setAvatarUrl(initialUser.avatarUrl ?? '')
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel>
        <SectionHeader label="Riding statistics" icon={Route} />
        <div className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-4">
          <Stat label="Rides" value={String(rides.length)} />
          <Stat label="Distance" value={formatDistance(totalDistance)} />
          <Stat label="Time riding" value={formatDuration(totalDuration)} />
          <Stat label="Reports filed" value={String(myReports.length)} />
        </div>
        <p className="border-t border-border px-4 py-2.5 text-[10px] leading-relaxed text-text-muted">
          Statistics are computed from your recorded rides and submitted community reports. Rides and
          routes stay private to your account.
        </p>
      </Panel>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-panel-2 px-3 py-2.5 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}
