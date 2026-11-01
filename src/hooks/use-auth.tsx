'use client'

// NIGHTRIDE — auth context: session user + settings with login/register/logout.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api } from '@/lib/api-client'
import type { SessionUser, UserSettings } from '@/types'

interface AuthState {
  user: SessionUser | null
  settings: UserSettings | null
  loading: boolean
  refresh: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

const DEFAULT_SETTINGS: UserSettings = {
  shareRidePresence: false,
  publicProfile: true,
  notifyNearbyReports: true,
  notifySafetyAlerts: true,
  notifyReportReplies: true,
  notifyRideSummaries: true,
  defaultMapStyle: 'auto',
  showLayerLabels: true,
  keepMapCenterState: true,
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ user: SessionUser | null; settings: UserSettings | null }>(
        '/api/auth/me',
      )
      setUser(res.user)
      setSettings(res.settings ?? DEFAULT_SETTINGS)
    } catch {
      setUser(null)
      setSettings(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(
    async (username: string, password: string) => {
      await api.post('/api/auth/login', { username, password })
      await refresh()
    },
    [refresh],
  )

  const register = useCallback(
    async (username: string, password: string) => {
      await api.post('/api/auth/register', { username, password })
      await refresh()
    },
    [refresh],
  )

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => undefined)
    setUser(null)
    setSettings(null)
  }, [])

  const updateSettings = useCallback(
    async (patch: Partial<UserSettings>) => {
      const res = await api.patch<{ settings: UserSettings }>('/api/account/settings', patch)
      setSettings(res.settings)
    },
    [],
  )

  const value = useMemo(
    () => ({ user, settings: settings ?? DEFAULT_SETTINGS, loading, refresh, login, register, logout, updateSettings }),
    [user, settings, loading, refresh, login, register, logout, updateSettings],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
