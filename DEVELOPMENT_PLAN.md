# NIGHTRIDE — DEVELOPMENT PLAN

> E-Moto Intelligence, Ride Tracking and Community Safety Platform
> Document created during Phase 0 (Project Inspection) before implementation.

---

## 1. Current project architecture (inspection results)

| Area | Finding |
|---|---|
| Framework | Next.js 16.1.1 (App Router), React 19, TypeScript 5 |
| Styling | Tailwind CSS 4 + shadcn/ui (New York style, full component set in `src/components/ui`) |
| Fonts | Geist / Geist Mono (`next/font/google`) |
| Icons | Lucide React 0.525 |
| Database | Prisma 6 + SQLite (`db/custom.db`), only demo `User`/`Post` models exist |
| Auth | NextAuth v4 available in dependencies, **not configured** |
| State | Zustand 5, TanStack Query 5 available, not yet used |
| Realtime | Socket.IO example in `examples/` only (not wired) |
| Entry point | `src/app/page.tsx` — placeholder logo page (non-functional) |
| API | `src/app/api/route.ts` — hello-world endpoint only |
| Gateway | Caddy on `:81`, proxies to Next.js `:3000`, `?XTransformPort=` for mini-services |
| Environment | `.env` contains **only** `DATABASE_URL` (value redacted). **No Mapbox token, no Supabase credentials** present |
| Map / Supabase / aviation | No references anywhere in the codebase — nothing to preserve beyond scaffold |
| Known broken / incomplete | Everything except the scaffold itself: no routes, no design system, no data model in use, no API integrations |

**Conclusion:** the project is a fresh scaffold. Nothing functional must be preserved apart from the
build system, shadcn/ui component library, Prisma setup and the Caddy gateway conventions.

## 2. Planned architecture

```
Next.js 16 App Router (TypeScript strict)
├── src/app
│   ├── page.tsx                     → redirects to /dashboard (sandbox entry route)
│   ├── layout.tsx                   → root layout, fonts, providers
│   ├── (app)/                       → authenticated-capable shell (sidebar + mobile nav)
│   │   ├── dashboard | map | community | rides | saved | activity | settings | profile
│   ├── auth/{login,register}        → account creation / sign-in
│   └── api/                         → REST layer (never call third-party APIs from UI)
│       ├── auth/{register,login,logout,me}
│       ├── rides/{route,[id],active}
│       ├── community/reports/[...]  → CRUD + comments + confirmations + abuse flags
│       ├── locations/{route,[id]}   → saved locations
│       ├── external/{aviation,charging,public-safety,cameras,geocode}
│       ├── status                   → real connectivity tests for the status page
│       └── account/{settings,export,delete}
├── src/components/{layout,dashboard,map,community,rides,activity,settings,shared}
├── src/hooks      → useAuth, useGeolocation, useRideTracker, useRealtime, useMapState
├── src/services   → one typed client module per domain (map, aviation, traffic, cameras,
│                    publicSafety, community) — UI components never fetch directly
├── src/lib        → auth (scrypt + signed sessions), api-cache (TTL + freshness),
│                    external/{opensky,overpass,nws,nominatim,cameras}, geo, validators
├── src/stores     → Zustand (map view/layers persisted, notification prefs)
├── src/types      → shared TypeScript interfaces for API + DB records
├── prisma         → SQLite schema mirroring the required Supabase tables
├── supabase/migrations → production PostgreSQL DDL + Row Level Security policies
└── mini-services/realtime-service   → Socket.IO (port 3003): report/safety events,
     consent-gated rider presence (never polled; pushed)
```

**Map engine:** MapLibre GL JS (open-source lineage of Mapbox GL JS) in a reusable component set.
Style resolution: if `NEXT_PUBLIC_MAPBOX_TOKEN` is set → real Mapbox **dark-v11** raster tiles via the
Mapbox Styles API; otherwise → OpenStreetMap-based CARTO **dark_all** tiles (keyless fallback so the
map is genuinely functional). The engine, controls and layer logic are identical in both modes.

**Data honesty rule:** every external dataset renders only from real provider responses. When a
provider requires credentials that are absent (traffic cameras, Supabase), the layer/panel shows an
explicit *unavailable / not configured* state with instructions — no invented markers, ever.

## 3. Features to implement

| Route | Features |
|---|---|
| `/dashboard` | Welcome header, rider status (auth/GPS/active ride), recent ride summary, nearby community reports, road condition alerts, public safety announcements (NWS-sourced), quick map access, saved locations |
| `/map` | Full-screen dark map, GPS with permission + recenter + zoom, layer selector (7 independent layers), search (Nominatim), location details + reverse geocode, report submission, loading states, API connection status, legend |
| `/community` | Submit / filter / view reports (7 categories), comments, confirmations, resolve, abuse reporting, details dialog, realtime updates |
| `/rides` | GPS ride tracking: start/pause/resume/end, distance, duration, avg/max speed, accuracy + permission + connection error handling, refresh recovery, history, route replay, delete |
| `/saved` | Save/name/describe/categorize/delete locations, view on map (deep link) |
| `/activity` | Chronological feed: community reports, road condition updates, public safety announcements, road closures, aviation activity summary — each with source + timestamp |
| `/settings` | Account, privacy, location permissions, notifications, map preferences, API status, data export/management, account deletion |
| `/profile` | Identity, avatar, ride/report statistics |

Cross-cutting: design system (exact palette), responsive shell (fixed sidebar desktop / bottom nav
mobile), realtime events, privacy controls (presence sharing is opt-in per ride), authentication.

## 4. Required APIs

| Provider | Purpose | Key needed | Live connectivity test (sandbox) |
|---|---|---|---|
| Mapbox (Styles/tiles API) | Dark vector-quality basemap | Yes (`NEXT_PUBLIC_MAPBOX_TOKEN`) | 401 without token — expected; integration ready |
| OSM / CARTO dark tiles | Keyless dark basemap fallback | No | **200 OK** (24 ms) |
| OpenSky Network | General air-traffic awareness layer | No (anonymous; optional key) | **200 OK** — live state vectors |
| Overpass API (OSM mirror `overpass.osm.ch`) | Charging stations (real OSM POIs) | No | **200 OK** |
| Nominatim (OSM) | Map search + reverse geocode | No (UA required) | **200 OK** |
| NWS `api.weather.gov` | Official public safety alerts → announcements | No (UA required) | **200 OK** (377 active alerts) |
| OpenChargeMap | Alternative charging source | Yes | 403 without key — documented alternative |
| WSDOT Traveler API (cameras/alerts) | Traffic camera inventory | Yes (free AccessCode) | Not configured — module + status ready |
| Supabase | Production Postgres + Realtime + Auth | Yes | Not configured — local Prisma persistence active; migrations with RLS provided |

Full research in `API_RESEARCH.md` (Phase 4 deliverable).

## 5. Database requirements

Tables (Prisma/SQLite locally, identical DDL + RLS in `supabase/migrations`):

- `profiles` — id, username (unique), avatar_url, created_at, updated_at
- `sessions` — server-side auth sessions (local auth; Supabase Auth replaces in production)
- `rides` — user_id, started_at, ended_at, duration_seconds, distance_meters, average_speed,
  maximum_speed, route_data (JSON track points), status (active/paused/completed)
- `saved_locations` — user_id, name, description, latitude, longitude, category, created_at
- `community_reports` — user_id, title, description, category, latitude, longitude, status,
  verification_status, hidden (moderation), created_at, updated_at
- `report_comments`, `report_confirmations` (unique per user+report), `abuse_flags`
- `public_camera_locations` — verified inventories only (source_url, last_verified_at)
- `public_safety_events` — NWS-synced official alerts (external_id, source_url, occurred_at)
- `user_settings` — privacy / notifications / map preferences per user

Security: ownership enforced in the API layer locally (testable), and via **Row Level Security**
policies in the Supabase migration (public read for community data; writes restricted to owner;
camera/safety tables read-only for ordinary users; rider GPS never stored server-side unless the
user explicitly saves a ride route).

## 6. Development stages

1. **Stage A — Foundation:** docs (this file, API_RESEARCH.md), `.env.example`, packages
   (`maplibre-gl`, `socket.io`, `socket.io-client`), Prisma schema + push, Supabase migration SQL.
2. **Stage B — Core libs:** types, geo math, auth (scrypt + session cookies), TTL cache with
   freshness classification, validators, external provider modules (timeout/retry/rate-limit).
3. **Stage C — API layer:** all REST routes with zod validation, error handling, ownership checks.
4. **Stage D — Realtime:** Socket.IO mini-service (events + consent-gated presence), client hook.
5. **Stage E — Design system + shell:** exact palette tokens, typography, sidebar/mobile nav,
   shared components (StatusDot, DataSourceBadge, EmptyState…).
6. **Stage F — Map engine:** MapContainer, controls, layer manager, search, location panel,
   marker renderer, report sheet — memoized, no unnecessary re-renders, view state persisted.
7. **Stage G — Pages:** dashboard, community, rides, saved, activity, settings, profile, auth.
8. **Stage H — Verification:** `tsc --noEmit`, `eslint`, API integration test suite, agent-browser
   E2E (all routes, golden paths, mobile + desktop), bundle secret scan, FINAL_REPORT.md.

## 7. Testing requirements

- **Static:** TypeScript check (`tsc --noEmit`), ESLint (`bun run lint`).
- **Automated API suite** (`scripts/api-tests.mjs`, run against the live dev server):
  register/login/logout; ride create → persist → ownership guard; community report CRUD, comments,
  confirmations, abuse flags; saved locations CRUD; ownership isolation between two accounts;
  external endpoints (aviation / charging / safety / geocode) returning real data or explicit
  unavailable states; status endpoint connectivity matrix.
- **E2E (agent-browser):** every route renders, navigation works, map loads and controls work,
  layers toggle, search flies to result, report submitted end-to-end, mobile + desktop layouts,
  footer/nav behavior, console free of errors.
- **Honesty checks:** no fake coordinates, no fake "connected" statuses, no secrets in client
  bundle (scan `.next` for key patterns), unavailable providers visibly labelled.
- **RLS:** local ownership tests + `supabase/tests/rls-test.sql` script for execution against a
  real Supabase project (no Postgres available in this sandbox — stated explicitly).

## 8. Outstanding configuration requirements

| Variable | Purpose | How to obtain |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Switch basemap to Mapbox dark-v11 | https://account.mapbox.com/auth/signup/ → default public token |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Production Postgres + Realtime + Auth | https://supabase.com/dashboard → Project Settings → API |
| `AVIATION_PROVIDER_API_KEY` | Optional OpenSky key (higher rate limits) | https://opensky-network.org/my-opensky/api-client-credentials |
| `TRAFFIC_CAMERA_API_URL` + `TRAFFIC_CAMERA_API_KEY` | Official camera inventory (e.g. WSDOT) | https://wsdot.wa.gov/traffic/api/ (free AccessCode) |

Without these, the app runs fully on keyless providers (OSM basemap, Overpass charging, OpenSky
anonymous, NWS safety) with local persistence, and the Settings → API status page shows exactly
what is connected, missing, and how to enable it.
