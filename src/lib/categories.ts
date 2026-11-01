// NIGHTRIDE — report + location category metadata.

import type { ReportCategory, SavedLocationCategory } from '@/types'

export const REPORT_CATEGORY_META: Record<
  ReportCategory,
  { label: string; short: string; description: string }
> = {
  road_hazard: {
    label: 'Road hazard',
    short: 'Hazard',
    description: 'Debris, oil, gravel, ice or anything making the surface dangerous',
  },
  damaged_road: {
    label: 'Damaged road',
    short: 'Damage',
    description: 'Potholes, cracks, sunken pavement, broken shoulder',
  },
  construction: {
    label: 'Construction',
    short: 'Works',
    description: 'Road works, lane closures, loose surface and work zones',
  },
  road_closure: {
    label: 'Road closure',
    short: 'Closure',
    description: 'Full or partial closure, blocked route',
  },
  charging_station: {
    label: 'Charging station',
    short: 'Charging',
    description: 'Working (or broken) charging location for e-motos',
  },
  riding_location: {
    label: 'Riding location',
    short: 'Ride area',
    description: 'Legal, enjoyable riding area worth sharing',
  },
  general_safety: {
    label: 'General safety',
    short: 'Safety',
    description: 'Any other rider-safety observation',
  },
  police_activity: {
    label: 'Police activity',
    short: 'Police',
    description: 'Community-reported police presence — checkpoint, patrol parked, activity. Auto-expires after 2 hours',
  },
}

export const REPORT_CATEGORIES = Object.keys(REPORT_CATEGORY_META) as ReportCategory[]

export const SAVED_LOCATION_CATEGORY_META: Record<
  SavedLocationCategory,
  { label: string }
> = {
  charging: { label: 'Charging' },
  meeting_point: { label: 'Meeting point' },
  viewpoint: { label: 'Viewpoint' },
  parking: { label: 'Parking' },
  custom: { label: 'Custom' },
}

export const SAVED_LOCATION_CATEGORIES = Object.keys(
  SAVED_LOCATION_CATEGORY_META,
) as SavedLocationCategory[]

/** Which map layer a report category feeds. */
export function layerForCategory(category: ReportCategory) {
  switch (category) {
    case 'road_closure':
      return 'road_closures' as const
    case 'riding_location':
      return 'riding_areas' as const
    case 'charging_station':
      return 'charging' as const
    case 'police_activity':
      return 'police_activity' as const
    default:
      return 'road_hazards' as const
  }
}
