// NIGHTRIDE — Prisma record → API interface serialization.

import { haversineMeters } from '@/lib/geo'
import type {
  CommunityReport as DbReport,
  ReportComment as DbComment,
  Ride as DbRide,
  SavedLocation as DbSavedLocation,
  PublicSafetyEvent as DbSafetyEvent,
  PublicCameraLocation as DbCamera,
  UserSettings as DbSettings,
} from '@prisma/client'
import type {
  CommunityReport,
  ReportComment,
  Ride,
  TrackPoint,
  SavedLocation,
  PublicSafetyEvent,
  PublicCameraLocation,
  UserSettings,
} from '@/types'

type ReportWithMeta = DbReport & {
  user?: { username: string; avatarUrl: string | null } | null
  _count?: { confirmations: number; comments: number }
}

export function serializeReport(
  r: ReportWithMeta,
  refLat?: number,
  refLng?: number,
): CommunityReport {
  const distanceMeters =
    refLat !== undefined && refLng !== undefined
      ? haversineMeters(refLat, refLng, r.latitude, r.longitude)
      : undefined
  return {
    id: r.id,
    userId: r.userId,
    author: r.user ? { username: r.user.username, avatarUrl: r.user.avatarUrl } : null,
    title: r.title,
    description: r.description,
    category: r.category as CommunityReport['category'],
    latitude: r.latitude,
    longitude: r.longitude,
    locationLabel: r.locationLabel,
    status: r.status as CommunityReport['status'],
    verificationStatus: r.verificationStatus as CommunityReport['verificationStatus'],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    confirmationCount: r._count?.confirmations ?? 0,
    commentCount: r._count?.comments ?? 0,
    ...(distanceMeters !== undefined ? { distanceMeters } : {}),
  }
}

type CommentWithUser = DbComment & {
  user?: { username: string; avatarUrl: string | null } | null
}

export function serializeComment(c: CommentWithUser): ReportComment {
  return {
    id: c.id,
    reportId: c.reportId,
    userId: c.userId,
    author: c.user ? { username: c.user.username, avatarUrl: c.user.avatarUrl } : null,
    content: c.content,
    createdAt: c.createdAt.toISOString(),
  }
}

export function serializeRide(r: DbRide): Ride {
  let route: TrackPoint[] = []
  try {
    const parsed = JSON.parse(r.routeData || '[]')
    if (Array.isArray(parsed)) route = parsed as TrackPoint[]
  } catch {
    route = []
  }
  return {
    id: r.id,
    userId: r.userId,
    title: r.title,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt ? r.endedAt.toISOString() : null,
    durationSeconds: r.durationSeconds,
    distanceMeters: r.distanceMeters,
    averageSpeed: r.averageSpeed,
    maximumSpeed: r.maximumSpeed,
    routeData: route,
    status: r.status as Ride['status'],
    createdAt: r.createdAt.toISOString(),
  }
}

export function serializeSavedLocation(l: DbSavedLocation): SavedLocation {
  return {
    id: l.id,
    userId: l.userId,
    name: l.name,
    description: l.description,
    latitude: l.latitude,
    longitude: l.longitude,
    category: l.category as SavedLocation['category'],
    createdAt: l.createdAt.toISOString(),
  }
}

export function serializeSafetyEvent(e: DbSafetyEvent): PublicSafetyEvent {
  return {
    id: e.id,
    externalId: e.externalId,
    title: e.title,
    description: e.description,
    category: e.category,
    severity: e.severity,
    latitude: e.latitude,
    longitude: e.longitude,
    areaDesc: e.areaDesc,
    sourceUrl: e.sourceUrl,
    sourceName: e.sourceName,
    occurredAt: e.occurredAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  }
}

export function serializeCamera(c: DbCamera): PublicCameraLocation {
  return {
    id: c.id,
    name: c.name,
    latitude: c.latitude,
    longitude: c.longitude,
    cameraType: c.cameraType,
    sourceUrl: c.sourceUrl,
    lastVerifiedAt: c.lastVerifiedAt.toISOString(),
  }
}

export function serializeSettings(s: DbSettings): UserSettings {
  return {
    shareRidePresence: s.shareRidePresence,
    publicProfile: s.publicProfile,
    notifyNearbyReports: s.notifyNearbyReports,
    notifySafetyAlerts: s.notifySafetyAlerts,
    notifyReportReplies: s.notifyReportReplies,
    notifyRideSummaries: s.notifyRideSummaries,
    defaultMapStyle: s.defaultMapStyle as UserSettings['defaultMapStyle'],
    showLayerLabels: s.showLayerLabels,
    keepMapCenterState: s.keepMapCenterState,
  }
}
