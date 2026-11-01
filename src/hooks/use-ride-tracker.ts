'use client'

// NIGHTRIDE — GPS ride tracking engine.
//
// Honest tracking contract (spec):
//   - Requires explicit GPS permission; never fabricates movement.
//   - Distance/speed come from real GPS fixes (Haversine, jitter-filtered).
//   - Poor-accuracy fixes (> 75 m) are ignored and flagged in the UI.
//   - Points sync to the server every 10 s; failures are queued and retried
//     (the UI shows an honest "offline — will sync" state).
//   - After a page refresh the active ride is recovered from the server and
//     the rider is offered Resume / Discard. The gap while the page was
//     closed is NOT recorded.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useGeolocation } from '@/hooks/use-geolocation'
import {
  deleteRide,
  fetchActiveRide,
  startRide,
  updateRide,
} from '@/services/rides/rideService'
import { haversineMeters } from '@/lib/geo'
import type { Ride, TrackPoint } from '@/types'

export type TrackerStatus = 'idle' | 'starting' | 'tracking' | 'paused' | 'ending' | 'recovered'

export interface TrackerSnapshot {
  status: TrackerStatus
  rideId: string | null
  startedAt: number | null
  distanceMeters: number
  durationSeconds: number
  currentSpeed: number | null
  averageSpeed: number
  maximumSpeed: number
  pointCount: number
  poorAccuracy: boolean
  offline: boolean
  lastSyncAt: number | null
  error: string | null
  /** gap note when recovering an interrupted session */
  interrupted: boolean
}

const SYNC_INTERVAL_MS = 10_000
const MAX_ACCURACY_M = 75
const MAX_PLAUSIBLE_SPEED = 55 // m/s ≈ 200 km/h
const MIN_MOVE_M = 1.5

interface Stats {
  distanceMeters: number
  durationMs: number
  maxSpeed: number
}

export function useRideTracker(isAuthenticated: boolean) {
  const queryClient = useQueryClient()
  const geo = useGeolocation({ auto: false })

  const [snapshot, setSnapshot] = useState<TrackerSnapshot>({
    status: 'idle',
    rideId: null,
    startedAt: null,
    distanceMeters: 0,
    durationSeconds: 0,
    currentSpeed: null,
    averageSpeed: 0,
    maximumSpeed: 0,
    pointCount: 0,
    poorAccuracy: false,
    offline: false,
    lastSyncAt: null,
    error: null,
    interrupted: false,
  })

  // ---- mutable engine state (survives re-renders) ----
  const statusRef = useRef<TrackerStatus>('idle')
  const rideIdRef = useRef<string | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const pointsRef = useRef<TrackPoint[]>([])
  const pendingRef = useRef<TrackPoint[]>([])
  const statsRef = useRef<Stats>({ distanceMeters: 0, durationMs: 0, maxSpeed: 0 })
  const lastAcceptedRef = useRef<TrackPoint | null>(null)
  const offlineRef = useRef(false)
  const lastSyncRef = useRef<number | null>(null)
  const errorRef = useRef<string | null>(null)
  const currentSpeedRef = useRef<number | null>(null)
  const poorAccRef = useRef(false)

  const publish = useCallback(() => {
    setSnapshot({
      status: statusRef.current,
      rideId: rideIdRef.current,
      startedAt: startedAtRef.current,
      distanceMeters: statsRef.current.distanceMeters,
      durationSeconds: Math.round(statsRef.current.durationMs / 1000),
      currentSpeed: currentSpeedRef.current,
      averageSpeed:
        statsRef.current.durationMs > 0
          ? statsRef.current.distanceMeters / (statsRef.current.durationMs / 1000)
          : 0,
      maximumSpeed: statsRef.current.maxSpeed,
      pointCount: pointsRef.current.length,
      poorAccuracy: poorAccRef.current,
      offline: offlineRef.current,
      lastSyncAt: lastSyncRef.current,
      error: errorRef.current,
      interrupted: statusRef.current === 'recovered',
    })
  }, [])

  const setError = useCallback(
    (message: string | null) => {
      errorRef.current = message
      publish()
    },
    [publish],
  )

  // ---------------------------------------------------- recovery on mount
  useEffect(() => {
    let cancelled = false
    if (!isAuthenticated) return
    ;(async () => {
      try {
        const { ride } = await fetchActiveRide()
        if (cancelled || !ride || ride.status === 'completed') return
        rideIdRef.current = ride.id
        startedAtRef.current = new Date(ride.startedAt).getTime()
        pointsRef.current = ride.routeData ?? []
        statsRef.current = {
          distanceMeters: ride.distanceMeters,
          durationMs: ride.durationSeconds * 1000,
          maxSpeed: ride.maximumSpeed,
        }
        statusRef.current = 'recovered'
        publish()
      } catch {
        /* not signed in or network error — idle is fine */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  // ---------------------------------------------------- GPS ingestion
  useEffect(() => {
    const coords = geo.coords
    if (!coords) return
    if (statusRef.current !== 'tracking') return

    const point: TrackPoint = {
      lat: coords.lat,
      lng: coords.lng,
      t: coords.timestamp || Date.now(),
      spd: coords.speed ?? undefined,
    }

    if (coords.accuracy > MAX_ACCURACY_M) {
      poorAccRef.current = true
      publish()
      return // ignore poor fix, keep honest distance
    }
    poorAccRef.current = false

    const last = lastAcceptedRef.current
    if (last) {
      const dt = (point.t - last.t) / 1000
      const d = haversineMeters(last.lat, last.lng, point.lat, point.lng)
      const v = dt > 0 ? d / dt : 0
      if (v > MAX_PLAUSIBLE_SPEED) return // GPS jitter spike
      if (d < MIN_MOVE_M && dt < 3) {
        // stationary noise — record the point but skip distance noise
      } else {
        statsRef.current.distanceMeters += d
        if (v > statsRef.current.maxSpeed) statsRef.current.maxSpeed = v
      }
      if (v > 0 && v < MAX_PLAUSIBLE_SPEED) currentSpeedRef.current = v
    }

    lastAcceptedRef.current = point
    pointsRef.current.push(point)
    pendingRef.current.push(point)
    publish()
  }, [geo.coords, publish])

  // ---------------------------------------------------- 1 s ride timer
  useEffect(() => {
    const timer = setInterval(() => {
      if (statusRef.current === 'tracking') {
        statsRef.current.durationMs += 1000
        publish()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [publish])

  // ---------------------------------------------------- periodic sync
  const syncNow = useCallback(async (): Promise<void> => {
    const rideId = rideIdRef.current
    if (!rideId) return
    const tracking = statusRef.current === 'tracking'
    if (!tracking && pendingRef.current.length === 0) return

    const body = {
      durationSeconds: Math.round(statsRef.current.durationMs / 1000),
      distanceMeters: statsRef.current.distanceMeters,
      averageSpeed:
        statsRef.current.durationMs > 0
          ? statsRef.current.distanceMeters / (statsRef.current.durationMs / 1000)
          : 0,
      maximumSpeed: statsRef.current.maxSpeed,
      ...(pendingRef.current.length > 0
        ? { appendPoints: pendingRef.current.slice() }
        : {}),
    }
    try {
      await updateRide(rideId, body)
      pendingRef.current = []
      if (offlineRef.current) {
        offlineRef.current = false
        errorRef.current = null
      }
      lastSyncRef.current = Date.now()
    } catch {
      offlineRef.current = true
      errorRef.current =
        'Sync interrupted — your ride keeps recording and will upload when the connection returns.'
    }
    publish()
  }, [publish])

  useEffect(() => {
    const timer = setInterval(() => {
      if (
        statusRef.current === 'tracking' &&
        (pendingRef.current.length > 0 || offlineRef.current)
      ) {
        void syncNow()
      }
    }, SYNC_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [syncNow])

  // Flush pending points when the tab is hidden/closed mid-ride.
  useEffect(() => {
    const onHide = () => {
      if (statusRef.current === 'tracking' && pendingRef.current.length > 0) {
        void syncNow()
      }
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [syncNow])

  // ---------------------------------------------------- controls

  const start = useCallback(async (): Promise<void> => {
    if (statusRef.current === 'tracking' || statusRef.current === 'starting') return
    if (!isAuthenticated) {
      setError('Sign in to start tracking rides.')
      return
    }
    setError(null)
    statusRef.current = 'starting'
    publish()

    try {
      if (geo.permission !== 'granted') {
        const first = await geo.requestOnce()
        if (!first) {
          statusRef.current = 'idle'
          setError(
            geo.error ??
              'GPS permission is required — ride tracking cannot run without real location fixes.',
          )
          return
        }
      }
      geo.start()

      const { ride } = await startRide()
      rideIdRef.current = ride.id
      startedAtRef.current = Date.now()
      pointsRef.current = []
      pendingRef.current = []
      statsRef.current = { distanceMeters: 0, durationMs: 0, maxSpeed: 0 }
      lastAcceptedRef.current = null
      statusRef.current = 'tracking'
      publish()
    } catch (err) {
      statusRef.current = 'idle'
      setError(err instanceof Error ? err.message : 'Could not start the ride.')
    }
  }, [isAuthenticated, geo, publish, setError])

  const pause = useCallback(async (): Promise<void> => {
    if (statusRef.current !== 'tracking') return
    statusRef.current = 'paused'
    currentSpeedRef.current = null
    publish()
    const rideId = rideIdRef.current
    if (rideId) {
      try {
        await updateRide(rideId, { status: 'paused' })
        await syncNow()
      } catch {
        offlineRef.current = true
        publish()
      }
    }
  }, [publish, syncNow])

  const resume = useCallback(async (): Promise<void> => {
    if (statusRef.current !== 'paused' && statusRef.current !== 'recovered') return
    const rideId = rideIdRef.current
    statusRef.current = 'tracking'
    publish()
    if (rideId) {
      try {
        await updateRide(rideId, { status: 'active' })
      } catch {
        offlineRef.current = true
        publish()
      }
    }
  }, [publish])

  const end = useCallback(async (): Promise<void> => {
    if (statusRef.current !== 'tracking' && statusRef.current !== 'paused' && statusRef.current !== 'recovered')
      return
    const rideId = rideIdRef.current
    statusRef.current = 'ending'
    publish()
    if (rideId) {
      try {
        await updateRide(rideId, {
          status: 'completed',
          endedAt: new Date().toISOString(),
          durationSeconds: Math.round(statsRef.current.durationMs / 1000),
          distanceMeters: statsRef.current.distanceMeters,
          averageSpeed:
            statsRef.current.durationMs > 0
              ? statsRef.current.distanceMeters / (statsRef.current.durationMs / 1000)
              : 0,
          maximumSpeed: statsRef.current.maxSpeed,
          ...(pendingRef.current.length > 0
            ? { appendPoints: pendingRef.current.slice() }
            : {}),
        })
      } catch (err) {
        // Retry once — losing a completed ride would be unacceptable.
        try {
          await updateRide(rideId, {
            status: 'completed',
            endedAt: new Date().toISOString(),
            durationSeconds: Math.round(statsRef.current.durationMs / 1000),
            distanceMeters: statsRef.current.distanceMeters,
          })
        } catch {
          setError(
            err instanceof Error
              ? `Could not save the ride: ${err.message}. It remains active — try ending again.`
              : 'Could not save the ride. It remains active — try ending again.',
          )
          statusRef.current = 'paused'
          publish()
          return
        }
      }
    }
    geo.stop()
    rideIdRef.current = null
    startedAtRef.current = null
    pointsRef.current = []
    pendingRef.current = []
    statsRef.current = { distanceMeters: 0, durationMs: 0, maxSpeed: 0 }
    lastAcceptedRef.current = null
    statusRef.current = 'idle'
    setError(null)
    publish()
    void queryClient.invalidateQueries({ queryKey: ['rides'] })
    void queryClient.invalidateQueries({ queryKey: ['active-ride'] })
  }, [geo, publish, queryClient, setError])

  const discard = useCallback(async (): Promise<void> => {
    const rideId = rideIdRef.current
    statusRef.current = 'ending'
    publish()
    if (rideId) {
      await deleteRide(rideId).catch(() => undefined)
    }
    geo.stop()
    rideIdRef.current = null
    startedAtRef.current = null
    pointsRef.current = []
    pendingRef.current = []
    statsRef.current = { distanceMeters: 0, durationMs: 0, maxSpeed: 0 }
    lastAcceptedRef.current = null
    statusRef.current = 'idle'
    setError(null)
    publish()
    void queryClient.invalidateQueries({ queryKey: ['rides'] })
  }, [geo, publish, queryClient, setError])

  const clearError = useCallback(() => setError(null), [setError])

  return {
    snapshot,
    geo,
    start,
    pause,
    resume,
    end,
    discard,
    clearError,
    /** latest recorded track (for live route drawing) */
    getPoints: () => pointsRef.current,
  }
}

export type RideTracker = ReturnType<typeof useRideTracker>
export type { Ride }
