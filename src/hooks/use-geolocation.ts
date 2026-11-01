'use client'

// NIGHTRIDE — geolocation hook.
// Honest permission handling: granted / denied / unavailable / timeout,
// with explicit user opt-in (no silent background watching).

import { useCallback, useEffect, useRef, useState } from 'react'

export type GeoPermission = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unavailable' | 'error'

export interface GeoCoords {
  lat: number
  lng: number
  accuracy: number
  heading: number | null
  speed: number | null
  timestamp: number
}

export interface GeolocationState {
  permission: GeoPermission
  coords: GeoCoords | null
  error: string | null
  watching: boolean
}

interface Options {
  /** automatically start watching when permission was previously granted */
  auto?: boolean
  enableHighAccuracy?: boolean
}

export function useGeolocation(options: Options = {}) {
  const { auto = false, enableHighAccuracy = true } = options
  const [state, setState] = useState<GeolocationState>({
    permission: 'unknown',
    coords: null,
    error: null,
    watching: false,
  })
  const watchIdRef = useRef<number | null>(null)
  const lastPosRef = useRef<GeoCoords | null>(null)

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setState((s) => ({ ...s, watching: false }))
  }, [])

  const handleError = useCallback((err: GeolocationPositionError) => {
    const messages: Record<number, string> = {
      1: 'Location permission denied. Enable it in your browser settings to use rider location features.',
      2: 'Position unavailable — no GPS/Wi-Fi location source could be reached.',
      3: 'Location request timed out.',
    }
    // A failed watcher must not block future start() calls.
    if (watchIdRef.current !== null) {
      try {
        navigator.geolocation.clearWatch(watchIdRef.current)
      } catch {
        /* already gone */
      }
      watchIdRef.current = null
    }
    setState((s) => ({
      ...s,
      permission: err.code === 1 ? 'denied' : 'error',
      error: messages[err.code] ?? err.message,
      watching: false,
    }))
  }, [])

  const handlePosition = useCallback((pos: GeolocationPosition) => {
    const coords: GeoCoords = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
      timestamp: pos.timestamp,
    }
    lastPosRef.current = coords
    setState((s) => ({
      ...s,
      permission: 'granted',
      coords,
      error: null,
      watching: true,
    }))
  }, [])

  const start = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState((s) => ({
        ...s,
        permission: 'unavailable',
        error: 'Geolocation is not available in this browser/context.',
      }))
      return
    }
    if (watchIdRef.current !== null) return
    setState((s) => ({ ...s, error: null }))
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      { enableHighAccuracy, maximumAge: 2000, timeout: 15000 },
    )
  }, [enableHighAccuracy, handlePosition, handleError])

  /** One-shot position read (for permission prompts / recentering). */
  const requestOnce = useCallback((): Promise<GeoCoords | null> => {
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setState((s) => ({
          ...s,
          permission: 'unavailable',
          error: 'Geolocation is not available in this browser/context.',
        }))
        resolve(null)
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          handlePosition(pos)
          resolve(lastPosRef.current)
        },
        (err) => {
          handleError(err)
          resolve(null)
        },
        { enableHighAccuracy, timeout: 12000, maximumAge: 5000 },
      )
    })
  }, [enableHighAccuracy, handlePosition, handleError])

  useEffect(() => {
    if (!auto) return
    // deferred so the effect body itself performs no synchronous setState
    const t = setTimeout(() => start(), 0)
    return () => {
      clearTimeout(t)
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [auto, start])

  return { ...state, start, stop, requestOnce }
}
