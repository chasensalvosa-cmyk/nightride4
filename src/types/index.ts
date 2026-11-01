// NIGHTRIDE — shared TypeScript interfaces for API responses and DB records.

// ---------------------------------------------------------------- auth / profile

export interface SessionUser {
  id: string
  username: string
  avatarUrl: string | null
  createdAt: string
}

export interface UserSettings {
  shareRidePresence: boolean
  publicProfile: boolean
  notifyNearbyReports: boolean
  notifySafetyAlerts: boolean
  notifyReportReplies: boolean
  notifyRideSummaries: boolean
  defaultMapStyle: 'auto' | 'mapbox' | 'osm'
  showLayerLabels: boolean
  keepMapCenterState: boolean
}

// ---------------------------------------------------------------- rides

export interface TrackPoint {
  lat: number
  lng: number
  /** epoch milliseconds */
  t: number
  /** m/s at this point (client-computed from GPS) */
  spd?: number
}

export type RideStatus = 'active' | 'paused' | 'completed'

export interface Ride {
  id: string
  userId: string
  title: string | null
  startedAt: string
  endedAt: string | null
  durationSeconds: number
  distanceMeters: number
  averageSpeed: number
  maximumSpeed: number
  routeData: TrackPoint[]
  status: RideStatus
  createdAt: string
}

// ---------------------------------------------------------------- community

export type ReportCategory =
  | 'road_hazard'
  | 'damaged_road'
  | 'construction'
  | 'road_closure'
  | 'charging_station'
  | 'riding_location'
  | 'general_safety'
  | 'police_activity'

export type ReportStatus = 'open' | 'resolved' | 'closed'
export type VerificationStatus = 'unverified' | 'confirmed' | 'disputed'

export interface CommunityReport {
  id: string
  userId: string
  author: { username: string; avatarUrl: string | null } | null
  title: string
  description: string
  category: ReportCategory
  latitude: number
  longitude: number
  locationLabel: string | null
  status: ReportStatus
  verificationStatus: VerificationStatus
  createdAt: string
  updatedAt: string
  /** transient sightings (police activity) auto-expire; null = permanent */
  expiresAt?: string | null
  confirmationCount: number
  commentCount: number
  /** filled by the API when the client supplies a reference position */
  distanceMeters?: number
}

export interface ReportComment {
  id: string
  reportId: string
  userId: string
  author: { username: string; avatarUrl: string | null } | null
  content: string
  createdAt: string
}

export type SavedLocationCategory =
  | 'charging'
  | 'meeting_point'
  | 'viewpoint'
  | 'parking'
  | 'custom'

export interface SavedLocation {
  id: string
  userId: string
  name: string
  description: string | null
  latitude: number
  longitude: number
  category: SavedLocationCategory
  createdAt: string
}

// ---------------------------------------------------------------- public data

export interface PublicCameraLocation {
  id: string
  name: string
  brand: string | null
  latitude: number
  longitude: number
  cameraType: string
  sourceUrl: string
  sourceName: string | null
  lastVerifiedAt: string
}

export interface PublicSafetyEvent {
  id: string
  externalId: string
  title: string
  description: string
  category: string
  severity: string | null
  latitude: number | null
  longitude: number | null
  areaDesc: string | null
  sourceUrl: string
  sourceName: string
  occurredAt: string
  updatedAt: string
}

// ---------------------------------------------------------------- external APIs

export interface AircraftState {
  icao24: string
  callsign: string | null
  originCountry: string
  latitude: number
  longitude: number
  baroAltitude: number | null
  geoAltitude: number | null
  onGround: boolean
  velocity: number | null // m/s
  trueTrack: number | null // degrees
  verticalRate: number | null // m/s
  timePosition: number | null
  lastContact: number | null
}

export interface ChargingStation {
  id: string
  name: string
  latitude: number
  longitude: number
  operator: string | null
  capacity: number | null
  socketTypes: string[]
  sourceUrl: string
}

export interface GeocodeResult {
  id: string
  label: string
  detail: string
  latitude: number
  longitude: number
  type: string
  /** great-circle meters from the search origin (rider position); present
   *  only when the search was biased to the user's location */
  distanceMeters?: number | null
}

/** One route option returned by the routing service (OSRM).
 *  `coordinates` are GeoJSON-ordered [lng, lat] pairs ready for MapLibre. */
export interface RouteOption {
  distanceMeters: number
  durationSeconds: number
  coordinates: [number, number][]
}

/** Data freshness, derived from real response timestamps — never guessed. */
export type Freshness = 'live' | 'delayed' | 'stale' | 'unavailable'

export interface FreshData<T> {
  data: T | null
  freshness: Freshness
  fetchedAt: string | null
  source: string
  attribution: string
  /** human explanation when unavailable/delayed */
  note?: string
}

// ---------------------------------------------------------------- api status

export type ProviderStatus = 'connected' | 'missing' | 'unreachable' | 'error' | 'rate_limited'

export interface ApiStatusEntry {
  key: string
  provider: string
  label: string
  status: ProviderStatus
  detail: string
  lastChecked: string
  attribution?: string
  /** where to obtain credentials, when missing */
  configUrl?: string
  configVar?: string
}

export interface ApiStatusResponse {
  checkedAt: string
  providers: ApiStatusEntry[]
}

// ---------------------------------------------------------------- activity feed

export type ActivityKind =
  | 'community_report'
  | 'road_condition'
  | 'public_safety'
  | 'road_closure'
  | 'aviation_summary'

export interface ActivityItem {
  id: string
  kind: ActivityKind
  title: string
  description: string
  timestamp: string
  sourceName: string
  sourceUrl?: string
  latitude?: number
  longitude?: number
  category?: string
  severity?: string | null
  reportId?: string
}

// ---------------------------------------------------------------- realtime

export interface RiderPresence {
  userId: string
  username: string
  lat: number
  lng: number
  heading: number | null
  speedKmh: number | null
  updatedAt: number
}

export type RealtimeEvent =
  | { event: 'report:new'; data: CommunityReport }
  | { event: 'report:updated'; data: { id: string; status: ReportStatus; verificationStatus: VerificationStatus; updatedAt: string } }
  | { event: 'comment:new'; data: { reportId: string; comment: ReportComment } }
  | { event: 'safety:new'; data: PublicSafetyEvent }
  | { event: 'presence:update'; data: RiderPresence[] }
  | { event: 'presence:leave'; data: { userId: string } }

// ---------------------------------------------------------------- map

export type MapLayerId =
  | 'riders'
  | 'cameras'
  | 'road_hazards'
  | 'road_closures'
  | 'charging'
  | 'riding_areas'
  | 'aviation'
  | 'police_activity'

export interface MapViewState {
  lat: number
  lng: number
  zoom: number
}
