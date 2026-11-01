// NIGHTRIDE — request validation schemas (zod).

import { z } from 'zod'

export const REPORT_CATEGORIES = [
  'road_hazard',
  'damaged_road',
  'construction',
  'road_closure',
  'charging_station',
  'riding_location',
  'general_safety',
  'police_activity',
] as const

/** How long community police-activity sightings stay visible before expiring. */
export const POLICE_ACTIVITY_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

export const SAVED_LOCATION_CATEGORIES = [
  'charging',
  'meeting_point',
  'viewpoint',
  'parking',
  'custom',
] as const

export const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, 'letters, numbers and underscore only'),
  password: z.string().min(8).max(128),
})

export const loginSchema = z.object({
  username: z.string().min(1).max(20),
  password: z.string().min(1).max(128),
})

export const trackPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  t: z.number().int().min(0),
  spd: z.number().min(0).max(150).optional(),
})

export const rideCreateSchema = z.object({
  startedAt: z.string().datetime().optional(),
  title: z.string().trim().max(80).optional(),
})

export const rideUpdateSchema = z.object({
  status: z.enum(['active', 'paused', 'completed']).optional(),
  title: z.string().trim().max(80).nullable().optional(),
  endedAt: z.string().datetime().optional(),
  durationSeconds: z.number().int().min(0).optional(),
  distanceMeters: z.number().min(0).optional(),
  averageSpeed: z.number().min(0).optional(),
  maximumSpeed: z.number().min(0).optional(),
  appendPoints: z.array(trackPointSchema).max(500).optional(),
})

export const reportCreateSchema = z.object({
  title: z.string().trim().min(4).max(120),
  description: z.string().trim().min(10).max(2000),
  category: z.enum(REPORT_CATEGORIES),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  locationLabel: z.string().trim().max(160).optional().nullable(),
})

export const reportUpdateSchema = z.object({
  status: z.enum(['open', 'resolved', 'closed']).optional(),
})

export const commentCreateSchema = z.object({
  content: z.string().trim().min(2).max(1000),
})

export const flagCreateSchema = z.object({
  reason: z.string().trim().min(3).max(300),
})

export const savedLocationCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  category: z.enum(SAVED_LOCATION_CATEGORIES).default('custom'),
})

export const settingsUpdateSchema = z.object({
  shareRidePresence: z.boolean().optional(),
  publicProfile: z.boolean().optional(),
  notifyNearbyReports: z.boolean().optional(),
  notifySafetyAlerts: z.boolean().optional(),
  notifyReportReplies: z.boolean().optional(),
  notifyRideSummaries: z.boolean().optional(),
  defaultMapStyle: z.enum(['auto', 'mapbox', 'osm']).optional(),
  showLayerLabels: z.boolean().optional(),
  keepMapCenterState: z.boolean().optional(),
})

export const profileUpdateSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
  avatarUrl: z
    .string()
    .url()
    .max(500)
    .nullable()
    .optional(),
})
