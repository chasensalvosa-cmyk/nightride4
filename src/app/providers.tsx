'use client'

// NIGHTRIDE — app-wide providers: TanStack Query, auth, realtime events,
// toasts. The RealtimeProvider keeps one socket alive app-wide and routes
// pushed events into stores + toast notifications (respecting preferences).

import { useEffect, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AuthProvider, useAuth } from '@/hooks/use-auth'
import { useRealtime } from '@/hooks/use-realtime'
import { useRealtimeStore } from '@/stores/realtime-store'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  })
}

function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user, settings } = useAuth()
  const setConnected = useRealtimeStore((s) => s.setConnected)
  const setRiders = useRealtimeStore((s) => s.setRiders)

  const { connected } = useRealtime({
    onReportNew: (report) => {
      if (settings?.notifyNearbyReports !== false) {
        toast(`New community report: ${report.title}`, {
          description: `By ${report.author?.username ?? 'a rider'} · just now`,
        })
      }
    },
    onSafetyNew: (event) => {
      if (settings?.notifySafetyAlerts !== false) {
        toast(`Safety alert: ${event.title}`, {
          description: `${event.sourceName} (official)`,
        })
      }
    },
    onPresence: (riders) => {
      setRiders(riders)
    },
  })

  useEffect(() => {
    setConnected(connected)
  }, [connected, setConnected])

  // Anonymous users still receive pushes, but presence sharing requires auth.
  useEffect(() => {
    if (!user) {
      setRiders(useRealtimeStore.getState().riders)
    }
  }, [user, setRiders])

  return <>{children}</>
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeProvider>{children}</RealtimeProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
