'use client'

// NIGHTRIDE — connected API status panel. Only reports "Connected" after a
// real connectivity test; missing providers show how to obtain credentials.

import { useQuery } from '@tanstack/react-query'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { fetchApiStatus } from '@/services/publicSafety/apiStatusService'
import { Panel, SectionHeader } from '@/components/shared/panels'
import { StatusDot } from '@/components/shared/status'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { ProviderStatus } from '@/types'

const STATUS_LABEL: Record<ProviderStatus, string> = {
  connected: 'Connected',
  missing: 'Not configured',
  unreachable: 'Unreachable',
  error: 'Error',
  rate_limited: 'Rate limited',
}

export function ApiStatusPanel() {
  const statusQuery = useQuery({
    queryKey: ['api-status'],
    queryFn: fetchApiStatus,
    staleTime: 30_000,
  })

  return (
    <Panel>
      <SectionHeader
        label="Connected APIs"
        icon={undefined}
        action={
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted">
              {statusQuery.data ? `tested ${new Date(statusQuery.data.checkedAt).toLocaleTimeString()}` : ''}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label="Re-test connectivity"
              onClick={() => void statusQuery.refetch()}
              disabled={statusQuery.isFetching}
            >
              <RefreshCw className={statusQuery.isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} aria-hidden />
            </Button>
          </div>
        }
      />
      {statusQuery.isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full bg-panel-2" />
          ))}
        </div>
      ) : (
        <div>
          <ul className="divide-y divide-border">
            {(statusQuery.data?.providers ?? []).map((p) => (
              <li key={p.key} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <StatusDot status={p.status} />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">{p.label}</p>
                      <p className="truncate text-[10px] text-text-muted">{p.provider}</p>
                    </div>
                  </div>
                  <span
                    className={
                      p.status === 'connected'
                        ? 'shrink-0 text-[10px] font-medium uppercase tracking-wider text-status-success'
                        : 'shrink-0 text-[10px] font-medium uppercase tracking-wider text-text-muted'
                    }
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                </div>
                <p className="mt-1 pl-[18px] text-[10px] leading-relaxed text-text-secondary">{p.detail}</p>
                {p.status === 'missing' && p.configUrl && (
                  <p className="mt-1 pl-[18px] text-[10px] leading-relaxed text-text-muted">
                    Set <code className="rounded bg-panel-2 px-1 py-0.5 text-[9px]">{p.configVar}</code> —
                    obtain credentials at{' '}
                    <a
                      href={p.configUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
                    >
                      {new URL(p.configUrl).hostname} <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                    </a>
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-4 py-2.5 text-[10px] leading-relaxed text-text-muted">
            Connectivity is tested live on every refresh — a provider is only shown as Connected
            after a successful response.
          </p>
        </div>
      )}
    </Panel>
  )
}
