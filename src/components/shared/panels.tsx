'use client'

// NIGHTRIDE — shared building blocks: panels, section headers, empty states,
// loading skeletons, auth gate, category badge.

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  Ban,
  BatteryCharging,
  Bike,
  Construction,
  HardHat,
  LogIn,
  Mountain,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { REPORT_CATEGORY_META } from '@/lib/categories'
import type { ReportCategory } from '@/types'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

/** Main panel: #141414 card used across all pages. */
export function Panel({
  children,
  className,
  as: Comp = 'section',
}: {
  children: React.ReactNode
  className?: string
  as?: 'section' | 'div' | 'aside' | 'article'
}) {
  return (
    <Comp
      className={cn(
        'rounded-lg border border-border bg-panel',
        className,
      )}
    >
      {children}
    </Comp>
  )
}

export function SectionHeader({
  label,
  icon: Icon,
  action,
  className,
}: {
  label: string
  icon?: LucideIcon
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-2 px-4 pt-4 pb-3', className)}>
      <h2 className="label-micro flex items-center gap-2">
        {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
        {label}
      </h2>
      {action}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className,
}: {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-panel-2">
        <Icon className="h-5 w-5 text-text-muted" aria-hidden />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-text-secondary">{description}</p>
      {actionLabel && actionHref ? (
        <Button asChild size="sm" variant="secondary" className="mt-4">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : actionLabel && onAction ? (
        <Button size="sm" variant="secondary" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}

export function LoadingRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2 p-4', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-md bg-panel-2" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3 bg-panel-2" />
            <Skeleton className="h-3 w-1/3 bg-panel-2" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Auth gate shown where an action needs an account. */
export function AuthGate({
  feature,
  className,
}: {
  feature: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-8 text-center', className)}>
      <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-panel-2">
        <LogIn className="h-5 w-5 text-text-muted" aria-hidden />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">Sign in to {feature}</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-text-secondary">
        Free account — pick a username and password. Your rides and locations stay private to you.
      </p>
      <div className="mt-4 flex gap-2">
        <Button asChild size="sm" variant="secondary">
          <Link href="/auth/login">Sign in</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/auth/register">Create account</Link>
        </Button>
      </div>
    </div>
  )
}

const CATEGORY_ICONS: Record<ReportCategory, LucideIcon> = {
  road_hazard: TriangleAlert,
  damaged_road: Construction,
  construction: HardHat,
  road_closure: Ban,
  charging_station: BatteryCharging,
  riding_location: Mountain,
  general_safety: ShieldAlert,
}

export function CategoryBadge({
  category,
  compact = false,
  className,
}: {
  category: ReportCategory
  compact?: boolean
  className?: string
}) {
  const Icon = CATEGORY_ICONS[category] ?? TriangleAlert
  const meta = REPORT_CATEGORY_META[category]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border bg-panel-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-secondary',
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {compact ? meta.short : meta.label}
    </span>
  )
}

export function RiderIcon({ className }: { className?: string }) {
  return <Bike className={cn('h-4 w-4', className)} aria-hidden />
}
