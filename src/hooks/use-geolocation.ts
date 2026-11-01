'use client'

// NIGHTRIDE — geolocation hook.
// Honest permission handling: granted / denied / unavailable / timeout,
// with explicit user opt-in (no silent background watching).
//
// Calibration: Wi-Fi/network fixes (desktop browsers especially) can be
// STABLE-BUT-WRONG — the geolocation database pins the rider's network to the
// wrong neighborhood and no GPS option changes that. The rider can calibrate
// once ("tap where you actually are"); the stored offset is then applied to
// every fix that still looks like the original wrong one. Real GPS fixes
// (good accuracy) and positions far from the anchor pass through untouched,
// so the correction never follows the rider onto the road.

import { useCallback, useEffect, useRef, useState } from 'react'
import { haversineMeters } from '@/lib/geo'

export type GeoPermission = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unavailable' | 'error'

export interface GeoCoords {
  lat: number
  lng: number
  accuracy: number
  heading: number | null
  speed: number | null
  timestamp: number
  /** set when the stored calibration shifted this fix */
  calibrated?: boolean
  /** device-reported position before the calibration was applied */
  rawLat?: number
  rawLng?: number
}

/** Manual position correction, persisted per-browser (localStorage) and
 *  shared by every hook instance (map, ride tracker, settings). */
export interface GeoCalibration {
  /** the device-reported fix this correction was measured against */
  anchorLat: number
  anchorLng: number
  /** correction added to matching fixes (degrees) */
  offsetLat: number
  offsetLng: number
  setAt: number
}

export interface GeolocationState {
  permission: GeoPermission
  coords: GeoCoords | null
  error: string | null
  watching: boolean
  /** the stored calibration, when one is active on this browser */
  calibration: GeoCalibration | null
}

interface Options {
  /** automatically start watching when permission was previously granted */
  auto?: boolean
  enableHighAccuracy?: boolean
}

const CALIBRATION_KEY = 'nightride:geo-calibration'
const CALIBRATION_EVENT = 'nightride:geo-calibration-changed'
/** A wrong Wi-Fi fix repeats at nearly the same coordinates every time; a fix
 *  further from the anchor than this is a different source (real GPS, or the
 *  rider moved) and must NOT be shifted. */
const CALIBRATION_ANCHOR_RADIUS_M = 2000
/** Fixes at least this accurate are trusted GPS — calibration is bypassed so
 *  a phone's real GPS fix is never offset by an older correction. 20 m, not
 *  50: phone Wi-Fi fixes routinely report 30-50 m ("close, but a few houses
 *  off my home") — those MUST stay correctable, while a true GPS fix with
 *  enableHighAccuracy is essentially always under 20 m. */
const CALIBRATION_BYPASS_ACCURACY_M = 20
/** Wi-Fi geolocation databases get corrected over time; drop stale records. */
const CALIBRATION_TTL_MS = 30 * 24 * 60 * 60 * 1000

function loadCalibration(): GeoCalibration | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CALIBRATION_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Partial<GeoCalibration>
    const setAt = c.setAt
    if (
      !Number.isFinite(c.anchorLat) ||
      !Number.isFinite(c.anchorLng) ||
      !Number.isFinite(c.offsetLat) ||
      !Number.isFinite(c.offsetLng) ||
      typeof setAt !== 'number' ||
      Date.now() - setAt > CALIBRATION_TTL_MS
    ) {
      window.localStorage.removeItem(CALIBRATION_KEY)
      return null
    }
    return c as GeoCalibration
  } catch {
    return null
  }
}

function storeCalibration(c: GeoCalibration | null) {
  if (typeof window === 'undefined') return
  try {
    if (c) window.localStorage.setItem(CALIBRATION_KEY, JSON.stringify(c))
    else window.localStorage.removeItem(CALIBRATION_KEY)
  } catch {
    /* storage unavailable (private mode) — calibration just won't persist */
  }
  window.dispatchEvent(new CustomEvent(CALIBRATION_EVENT))
}

/** Shift a raw fix by the stored calibration when it matches the anchor
 *  (same low-accuracy Wi-Fi/network spot). Everything else passes through. */
function applyCalibration(raw: GeoCoords, cal: GeoCalibration | null): GeoCoords {
  if (!cal) return raw
  const fromAnchorM = haversineMeters(raw.lat, raw.lng, cal.anchorLat, cal.anchorLng)
  const wifiClassFix = raw.accuracy > CALIBRATION_BYPASS_ACCURACY_M
  if (fromAnchorM > CALIBRATION_ANCHOR_RADIUS_M || !wifiClassFix) return raw
  return {
    ...raw,
    lat: raw.lat + cal.offsetLat,
    lng: raw.lng + cal.offsetLng,
    calibrated: true,
    rawLat: raw.lat,
    rawLng: raw.lng,
  }
}

export function useGeolocation(options: Options = {}) {
  const { auto = false, enableHighAccuracy = true } = options
  const [state, setState] = useState<GeolocationState>({
    permission: 'unknown',
    coords: null,
    error: null,
    watching: false,
    calibration: null,
  })
  const watchIdRef = useRef<number | null>(null)
  /** latest RAW device fix — the calibration is applied on top of it */
  const lastPosRef = useRef<GeoCoords | null>(null)
  const calibrationRef = useRef<GeoCalibration | null>(null)

  // Load the stored calibration once per mount and keep every hook instance
  // in sync (map dot, ride tracker and settings share the same record).
  useEffect(() => {
    calibrationRef.current = loadCalibration()
    setState((s) => ({ ...s, calibration: calibrationRef.current }))
    const sync = () => {
      calibrationRef.current = loadCalibration()
      const raw = lastPosRef.current
      setState((s) => ({
        ...s,
        calibration: calibrationRef.current,
        coords: raw ? applyCalibration(raw, calibrationRef.current) : s.coords,
      }))
    }
    window.addEventListener(CALIBRATION_EVENT, sync)
    return () => window.removeEventListener(CALIBRATION_EVENT, sync)
  }, [])

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

  const handlePosition = useCallback((pos: GeolocationPosition): GeoCoords => {
    const raw: GeoCoords = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
      timestamp: pos.timestamp,
    }
    lastPosRef.current = raw
    const effective = applyCalibration(raw, calibrationRef.current)
    setState((s) => ({
      ...s,
      permission: 'granted',
      coords: effective,
      error: null,
      watching: true,
    }))
    return effective
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
      // maximumAge: 0 — never render a stale cached fix; GPS accuracy
      // improves as fresh fixes stream in (first fix is often Wi-Fi based,
      // off by a neighborhood).
      { enableHighAccuracy, maximumAge: 0, timeout: 20000 },
    )
  }, [enableHighAccuracy, handlePosition, handleError])

  /** One-shot position read (for permission prompts / recentering).
   *  Resolves with the effective (calibration-corrected) coordinates. */
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
          resolve(handlePosition(pos))
        },
        (err) => {
          handleError(err)
          resolve(null)
        },
        { enableHighAccuracy, timeout: 15000, maximumAge: 0 },
      )
    })
  }, [enableHighAccuracy, handlePosition, handleError])

  /** Record a manual correction: the rider tapped `lat/lng` as their true
   *  position while the device reported the latest raw fix. The offset is
   *  stored and applied to future matching fixes. Returns the created
   *  calibration, or null when no raw fix was available to measure against. */
  const calibrateTo = useCallback((lat: number, lng: number): GeoCalibration | null => {
    const raw = lastPosRef.current
    if (!raw) return null
    const cal: GeoCalibration = {
      anchorLat: raw.lat,
      anchorLng: raw.lng,
      offsetLat: lat - raw.lat,
      offsetLng: lng - raw.lng,
      setAt: Date.now(),
    }
    calibrationRef.current = cal
    storeCalibration(cal)
    setState((s) => ({ ...s, calibration: cal, coords: applyCalibration(raw, cal) }))
    return cal
  }, [])

  /** Drop the stored correction — the device's raw fixes are used again. */
  const clearCalibration = useCallback(() => {
    calibrationRef.current = null
    storeCalibration(null)
    const raw = lastPosRef.current
    setState((s) => ({ ...s, calibration: null, coords: raw ?? s.coords }))
  }, [])

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

  return { ...state, start, stop, requestOnce, calibrateTo, clearCalibration }
}
