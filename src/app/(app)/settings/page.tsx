'use client'

// NIGHTRIDE — settings: account, privacy, location permissions, notifications,
// map preferences, connected APIs, data management, account deletion.

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Bell, Download, KeyRound, LayoutDashboard, Loader2, Lock, Map, Trash2, UserRound } from 'lucide-react'
import { ApiStatusPanel } from '@/components/settings/api-status-panel'
import { AuthGate, Panel, SectionHeader } from '@/components/shared/panels'
import { useAuth } from '@/hooks/use-auth'
import { useGeolocation } from '@/hooks/use-geolocation'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'

export default function SettingsPage() {
  const { user, settings, loading, updateSettings, logout } = useAuth()
  const signedIn = !!user && !loading
  const geo = useGeolocation({ auto: false })
  const router = useRouter()

  const [permission, setPermission] = useState<string>('unknown')
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((p) => {
        setPermission(p.state)
        p.onchange = () => setPermission(p.state)
      })
      .catch(() => undefined)
  }, [])

  if (!signedIn) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 lg:p-6">
        <Header />
        <Panel>
          <SectionHeader label="Account" icon={UserRound} />
          <AuthGate feature="manage your settings" />
        </Panel>
        <ApiStatusPanel />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 lg:p-6">
      <Header />

      {/* account */}
      <Panel>
        <SectionHeader label="Account" icon={UserRound} />
        <div className="space-y-1 px-4 pb-4 text-xs">
          <InfoRow label="Username" value={user!.username} />
          <InfoRow label="Member since" value={new Date(user!.createdAt).toLocaleDateString()} />
          <div className="pt-2">
            <Button asChild size="sm" variant="secondary">
              <a href="/profile">Edit profile</a>
            </Button>
          </div>
        </div>
      </Panel>

      {/* privacy */}
      <Panel>
        <SectionHeader label="Privacy" icon={Lock} />
        <div className="divide-y divide-border">
          <SettingRow
            id="share-presence"
            title="Share ride presence by default"
            description="When enabled, the Riders layer offers sharing your live position during rides. Sharing still requires the map switch — nothing is ever shared silently."
            checked={settings?.shareRidePresence ?? false}
            onChange={(v) => save(updateSettings, { shareRidePresence: v })}
          />
          <SettingRow
            id="public-profile"
            title="Public profile attribution"
            description="Show your username on community reports and comments. Your rides and saved locations stay private either way."
            checked={settings?.publicProfile ?? true}
            onChange={(v) => save(updateSettings, { publicProfile: v })}
          />
        </div>
      </Panel>

      {/* location permissions */}
      <Panel>
        <SectionHeader label="Location permissions" icon={KeyRound} />
        <div className="space-y-2 px-4 pb-4">
          <InfoRow label="Browser permission" value={permission} />
          <p className="text-[11px] leading-relaxed text-text-secondary">
            {permission === 'granted'
              ? 'Granted — the map can center on you and ride tracking is available.'
              : permission === 'denied'
                ? 'Denied — re-enable it in your browser site settings. Ride tracking and the rider-location dot stay off (never simulated).'
                : 'Not decided yet — the map and ride tracker will ask the first time you use them.'}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const fix = await geo.requestOnce()
                toast[fix ? 'success' : 'error'](
                  fix ? 'Location access granted' : 'Location unavailable',
                  { description: fix ? undefined : (geo.error ?? undefined) },
                )
              }}
            >
              Test location access
            </Button>
          </div>
        </div>
      </Panel>

      {/* notifications */}
      <Panel>
        <SectionHeader label="Notifications" icon={Bell} />
        <div className="divide-y divide-border">
          <SettingRow
            id="notify-reports"
            title="Nearby community reports"
            description="In-app toast when a rider publishes a new report."
            checked={settings?.notifyNearbyReports ?? true}
            onChange={(v) => save(updateSettings, { notifyNearbyReports: v })}
          />
          <SettingRow
            id="notify-safety"
            title="Public safety alerts"
            description="In-app toast for official safety announcements (NWS feed)."
            checked={settings?.notifySafetyAlerts ?? true}
            onChange={(v) => save(updateSettings, { notifySafetyAlerts: v })}
          />
          <SettingRow
            id="notify-replies"
            title="Replies to my reports"
            description="Comments and confirmations on your reports."
            checked={settings?.notifyReportReplies ?? true}
            onChange={(v) => save(updateSettings, { notifyReportReplies: v })}
          />
          <SettingRow
            id="notify-rides"
            title="Ride summaries"
            description="Reminder toast when a ride ends with sync pending."
            checked={settings?.notifyRideSummaries ?? true}
            onChange={(v) => save(updateSettings, { notifyRideSummaries: v })}
          />
        </div>
      </Panel>

      {/* map preferences */}
      <Panel>
        <SectionHeader label="Map preferences" icon={Map} />
        <div className="divide-y divide-border">
          <SettingRow
            id="map-labels"
            title="Show layer labels"
            description="Layer name badges in the map layer selector."
            checked={settings?.showLayerLabels ?? true}
            onChange={(v) => save(updateSettings, { showLayerLabels: v })}
          />
          <SettingRow
            id="map-center"
            title="Remember map position"
            description="Keep the last map center and zoom between visits."
            checked={settings?.keepMapCenterState ?? true}
            onChange={(v) => save(updateSettings, { keepMapCenterState: v })}
          />
          <div className="px-4 py-3">
            <Label className="text-xs font-medium text-foreground">Default basemap</Label>
            <p className="mt-0.5 text-[11px] leading-relaxed text-text-secondary">
              Auto uses Mapbox dark-v11 when a token is configured, otherwise the keyless
              OpenStreetMap dark basemap.
            </p>
            <div className="mt-2 flex gap-1.5">
              {(['auto', 'mapbox', 'osm'] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={(settings?.defaultMapStyle ?? 'auto') === s ? 'default' : 'secondary'}
                  className="text-[10px] uppercase tracking-wider"
                  onClick={() => save(updateSettings, { defaultMapStyle: s })}
                >
                  {s === 'auto' ? 'Auto' : s === 'mapbox' ? 'Mapbox' : 'OSM'}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      {/* connected APIs */}
      <ApiStatusPanel />

      {/* data management */}
      <Panel>
        <SectionHeader label="Data management" icon={Download} />
        <div className="space-y-3 px-4 pb-4">
          <p className="text-[11px] leading-relaxed text-text-secondary">
            Download everything NIGHTRIDE stores about you (profile, rides with routes, saved
            locations, reports, comments, settings) as JSON.
          </p>
          <Button asChild size="sm" variant="secondary" className="gap-1.5">
            <a href="/api/account/export" download>
              <Download className="h-3.5 w-3.5" aria-hidden /> Export my data
            </a>
          </Button>
        </div>
      </Panel>

      {/* account deletion */}
      <DeleteAccountPanel onDeleted={() => router.push('/dashboard')} onLogout={logout} />
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="text-lg font-semibold tracking-tight text-foreground">Settings</h1>
      <p className="mt-0.5 text-xs text-text-secondary">
        Account, privacy, permissions, data and connected services.
      </p>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{label}</span>
      <span className="text-xs text-foreground">{value}</span>
    </div>
  )
}

function SettingRow({
  id,
  title,
  description,
  checked,
  onChange,
}: {
  id: string
  title: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-xs font-medium text-foreground">
          {title}
        </Label>
        <p className="mt-0.5 text-[11px] leading-relaxed text-text-secondary">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
    </div>
  )
}

async function save(
  fn: (patch: Record<string, unknown>) => Promise<void>,
  patch: Record<string, unknown>,
) {
  try {
    await fn(patch)
    toast.success('Settings saved')
  } catch (err) {
    toast.error('Could not save settings', {
      description: err instanceof Error ? err.message : undefined,
    })
  }
}

function DeleteAccountPanel({
  onDeleted,
  onLogout,
}: {
  onDeleted: () => void
  onLogout: () => void
}) {
  const [password, setPassword] = useState('')
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => api.post('/api/account/delete', { password }),
    onSuccess: () => {
      toast.success('Account deleted', {
        description: 'All your rides, locations, reports and comments were removed.',
      })
      void queryClient.clear()
      setOpen(false)
      onLogout()
      onDeleted()
    },
    onError: (err) => {
      toast.error('Could not delete account', { description: err.message })
    },
  })

  return (
    <Panel className="border-status-danger/30">
      <SectionHeader label="Delete account" icon={Trash2} />
      <div className="space-y-3 px-4 pb-4">
        <p className="text-[11px] leading-relaxed text-text-secondary">
          Permanently deletes your profile and all owned data: rides (with GPS routes), saved
          locations, reports, comments and confirmations. This cannot be undone.
        </p>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="destructive" className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete my account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="border-border bg-panel">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-sm">Delete account permanently?</AlertDialogTitle>
              <AlertDialogDescription className="text-xs leading-relaxed">
                Type your password to confirm. Everything you own is erased — rides, saved
                locations, reports, comments.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Current password"
              className="border-border bg-panel-2 text-xs"
              aria-label="Current password"
            />
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="gap-1.5 bg-status-danger text-xs text-white hover:bg-status-danger/90"
                disabled={password.length < 1 || mutation.isPending}
                onClick={(e) => {
                  e.preventDefault()
                  mutation.mutate()
                }}
              >
                {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                Delete everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Panel>
  )
}
