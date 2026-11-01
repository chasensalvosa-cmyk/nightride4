'use client'

// NIGHTRIDE — application shell.
// Desktop: fixed left sidebar + main content. Mobile: compact top bar +
// bottom navigation with touch-friendly targets. The map route can suppress
// the shell padding for a full-bleed map.

import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Bike,
  Bookmark,
  LayoutDashboard,
  Map as MapIcon,
  MessagesSquare,
  Route,
  Settings,
  UserRound,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { useRealtimeStore } from '@/stores/realtime-store'
import { Button } from '@/components/ui/button'
import { StatusDot } from '@/components/shared/status'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  primary: boolean // shows in mobile bottom nav
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, primary: true },
  { href: '/map', label: 'Live Map', icon: MapIcon, primary: true },
  { href: '/community', label: 'Community', icon: MessagesSquare, primary: true },
  { href: '/rides', label: 'Rides', icon: Route, primary: true },
  { href: '/saved', label: 'Saved', icon: Bookmark, primary: false },
  { href: '/activity', label: 'Activity', icon: Activity, primary: true },
  { href: '/settings', label: 'Settings', icon: Settings, primary: false },
  { href: '/profile', label: 'Profile', icon: UserRound, primary: false },
]

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-1" aria-label="NIGHTRIDE home">
      <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-panel-2">
        <Bike className="h-4.5 w-4.5 text-foreground" aria-hidden />
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-[0.18em] text-foreground">
            NIGHTRIDE
          </span>
          <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.22em] text-text-muted">
            E-Moto Intelligence
          </span>
        </span>
      )}
    </Link>
  )
}

function UserChip() {
  const { user, loading } = useAuth()
  if (loading) {
    return <div className="h-12 animate-pulse rounded-md bg-panel-2" aria-hidden />
  }
  if (!user) {
    return (
      <div className="flex flex-col gap-2">
        <Button asChild size="sm" className="w-full">
          <Link href="/auth/register">Create account</Link>
        </Button>
        <Button asChild size="sm" variant="secondary" className="w-full">
          <Link href="/auth/login">Sign in</Link>
        </Button>
      </div>
    )
  }
  return (
    <Link
      href="/profile"
      className="flex items-center gap-2.5 rounded-md border border-border bg-panel-2 px-2.5 py-2 transition-soft hover:bg-hover"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-panel text-xs font-semibold uppercase text-foreground">
        {user.username.slice(0, 2)}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-medium text-foreground">{user.username}</span>
        <span className="text-[10px] uppercase tracking-wider text-text-muted">Rider profile</span>
      </span>
    </Link>
  )
}

function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="px-4 pb-4 pt-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto scroll-slim px-3" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-soft',
                active
                  ? 'bg-hover font-medium text-foreground'
                  : 'text-text-secondary hover:bg-hover hover:text-foreground',
              )}
            >
              <item.icon className="h-4.5 w-4.5 shrink-0" aria-hidden />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="space-y-3 border-t border-sidebar-border px-3 py-3">
        <div className="flex items-center justify-between px-1">
          <span className="label-micro">Realtime</span>
          <RealtimeIndicator />
        </div>
        <UserChip />
        <p className="px-1 text-[10px] leading-relaxed text-text-muted">
          Data from official public sources and the rider community. Rider locations are shared only
          with explicit consent.
        </p>
      </div>
    </aside>
  )
}

function RealtimeIndicator() {
  const connected = useRealtimeStore((s) => s.connected)
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
      <StatusDot status={connected ? 'connected' : 'missing'} />
      {connected ? 'Connected' : 'Offline'}
    </span>
  )
}

function MobileTopBar() {
  const pathname = usePathname()
  const current = NAV_ITEMS.find((i) => pathname.startsWith(i.href))
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-sidebar px-4 lg:hidden">
      <Logo compact />
      <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-secondary">
        {current?.label ?? 'Dashboard'}
      </span>
      <div className="flex items-center gap-1">
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex h-10 w-10 items-center justify-center rounded-md text-text-secondary transition-soft hover:bg-hover hover:text-foreground"
        >
          <Settings className="h-5 w-5" aria-hidden />
        </Link>
        <Link
          href="/profile"
          aria-label="Profile"
          className="flex h-10 w-10 items-center justify-center rounded-md text-text-secondary transition-soft hover:bg-hover hover:text-foreground"
        >
          <UserRound className="h-5 w-5" aria-hidden />
        </Link>
      </div>
    </header>
  )
}

function BottomNav() {
  const pathname = usePathname()
  const items = NAV_ITEMS.filter((i) => i.primary)
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-sidebar pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Primary mobile"
    >
      <div className="grid h-16 grid-cols-5">
        {items.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-[44px] flex-col items-center justify-center gap-1 text-[10px] font-medium uppercase tracking-wider transition-soft',
                active ? 'text-foreground' : 'text-text-muted hover:text-text-secondary',
              )}
            >
              <item.icon className="h-5 w-5" aria-hidden />
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isMapRoute = pathname.startsWith('/map')
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="lg:pl-60">
        {!isMapRoute && <MobileTopBar />}
        <main
          className={cn(
            // map page manages its own full-height layout
            isMapRoute ? 'h-[calc(100dvh-3.5rem)] lg:h-dvh' : 'min-h-[calc(100dvh-7.5rem)] pb-24 lg:pb-10',
          )}
        >
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
