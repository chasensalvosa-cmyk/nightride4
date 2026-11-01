// NIGHTRIDE — geographic math and display formatting helpers.

import type { TrackPoint } from '@/types'

const EARTH_RADIUS_M = 6371008.8

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Haversine distance in meters. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}

/** Total track length in meters (sum of segment distances). */
export function trackDistanceMeters(points: TrackPoint[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(
      points[i - 1].lat,
      points[i - 1].lng,
      points[i].lat,
      points[i].lng,
    )
  }
  return total
}

/** Speed in m/s between two track points. */
export function speedBetween(a: TrackPoint, b: TrackPoint): number {
  const d = haversineMeters(a.lat, a.lng, b.lat, b.lng)
  const dt = (b.t - a.t) / 1000
  if (dt <= 0) return 0
  return d / dt
}

// ---------------------------------------------------------------- formatting

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(meters < 10000 ? 2 : 1)} km`
}

export function formatSpeed(mps: number | null | undefined): string {
  if (mps == null || !Number.isFinite(mps)) return '—'
  return `${Math.round(mps * 3.6)} km/h`
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const s = Math.floor(seconds % 60)
  const m = Math.floor((seconds / 60) % 60)
  const h = Math.floor(seconds / 3600)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatCoordinate(value: number, axis: 'lat' | 'lng'): string {
  const hemi = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W'
  return `${Math.abs(value).toFixed(5)}° ${hemi}`
}

/** Bounding box for a center point + radius (meters), with latitude clamp. */
export function bboxAround(
  lat: number,
  lng: number,
  radiusMeters: number,
): { minLat: number; minLng: number; maxLat: number; maxLng: number } {
  const dLat = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI)
  const dLng =
    dLat / Math.max(Math.cos(toRad(Math.min(Math.abs(lat), 89.9))), 0.01)
  return {
    minLat: Math.max(lat - dLat, -90),
    maxLat: Math.min(lat + dLat, 90),
    minLng: lng - dLng,
    maxLng: lng + dLng,
  }
}
