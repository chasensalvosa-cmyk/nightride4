# NIGHTRIDE — FINAL REPORT

> E-Moto Intelligence, Ride Tracking and Community Safety Platform
> Build completed 2026-11-01 · Next.js 16 · TypeScript 5 · MapLibre GL · Prisma · Socket.IO

---

## 1. Features completed (verified working)

| Area | Status | Verification |
|---|---|---|
| **Design system** — exact specified palette (#090909/#101010/#141414/#191919/#292929/#F5F5F5/#929292/#656565/#222222), monochrome, Lucide icons, Geist sans, consistent radii & transitions | ✅ | Palette applied via CSS tokens; dark-only |
| **8 routes** — /dashboard /map /community /rides /saved /activity /settings /profile, each with its own page component + /auth/login + /auth/register; `/` redirects to /dashboard | ✅ | Browser-verified: every route renders, navigation works |
| **Dashboard** — welcome header, rider status (account/GPS/ride/realtime/providers), quick map, recent ride, nearby reports, road condition alerts, public safety announcements (NWS), saved locations | ✅ | Browser-verified |
| **Live map** — MapLibre GL dark map (OpenFreeMap dark vector, keyless; Esri World Dark Gray keyless raster fallback; Mapbox dark-v11 when a token exists), search (Nominatim, debounced), recenter + zoom controls, location details panel with reverse geocoding, report submission, loading states, API status chip, legend | ✅ | Browser-verified: tiles render (pixel-checked), search flies to results, controls work |
| **8 independent map layers** — Rider Locations (consent presence), Cameras & ALPR (**DeFlock/OSM inventory — 145k ALPR cameras, 116k Flock Safety — live**), Road Hazards, Road Closures, Charging Stations (OSM/Overpass), Legal Riding Areas, Public Aviation Awareness (OpenSky), Police Activity (community sightings, 2 h auto-expiry) — each independently toggleable, honest empty/unavailable states, **no invented coordinates** | ✅ | Browser-verified: Atlanta viewport renders 246 ALPR markers; toggles persist; aviation rate-limit state shown |
| **Community** — submit / filter (8 categories incl. police activity, status, newest/nearest) / view reports; comments; confirmations (2 distinct → verified); resolve/reopen (community), close/delete (author); abuse flags with 3-flag auto-hide; **police sightings auto-expire after 2 h** (stale enforcement positions are filtered server-side) | ✅ | API suite + browser E2E: expiry lifecycle tested (create → visible → expired → filtered) |
| **Ride tracking** — GPS start/pause/resume/end; distance, duration, avg/max speed; accuracy filter (>75 m ignored), jitter rejection; 10 s server sync with offline queue + retry; **page-refresh recovery** (resume/discard with honest gap note); history with route replay; delete | ✅ | Browser E2E with simulated fixes: 6 points, 268.2 m, avg/max speeds persisted |
| **GPS honesty** — explicit permission required; denied/unavailable/poor-accuracy/lost-sync states surfaced; never simulates a ride | ✅ | Browser-verified (headless denial state) |
| **Saved locations** — save/name/describe/categorize/delete, deep-link "View on map" | ✅ | API suite + browser |
| **Activity feed** — merged chronological feed: community reports, road conditions, closures, official NWS safety announcements (source + timestamp + severity), aviation activity summary — all attributed | ✅ | Browser + API |
| **Settings** — account, privacy (presence opt-in, public attribution), location permissions (state + test), notification preferences, map preferences, **API status page with real connectivity tests**, data export (JSON), account deletion (password-confirmed, full cascade) | ✅ | Browser + API suite |
| **Realtime** — Socket.IO service (gateway-routed): report/comment/safety pushes (toast + live list refresh), consent-gated rider presence (explicit per-session switch, 60 s TTL, never stored) | ✅ | Browser-verified end-to-end: presence marker, live toast from another user's API report |
| **Auth** — register/login/logout with scrypt hashing + httpOnly session cookies; ownership enforced everywhere (403/404 isolation verified between users) | ✅ | API suite: 66/66 |
| **Responsive shell** — desktop fixed sidebar + mobile top bar/bottom nav with safe-area, full-screen map on mobile | ✅ | Browser-verified at 390×844 and 1440×900 |
| **API status page** — Mapbox / OSM / OpenSky / Overpass / NWS / cameras / Supabase / realtime / database; "Connected" only after a live test; missing providers show the exact env var + official URL for credentials | ✅ | Browser + API |

## 2. Features partially completed (by design)

- **Mapbox dark-v11 basemap** — coded and switches on the moment `NEXT_PUBLIC_MAPBOX_TOKEN` is set;
  until then the keyless OpenFreeMap dark vector basemap runs (Esri World Dark Gray raster as
  keyless emergency fallback), resolved live at every map boot and shown in the status chip.
- **Municipal traffic-camera provider** (`TRAFFIC_CAMERA_API_URL`, e.g. WSDOT) — optional upgrade over
  the already-live keyless DeFlock/OSM ALPR inventory; the integration is coded and activates the
  moment the variable is set.
- **Supabase (Postgres + Auth + Realtime)** — complete production DDL with **Row Level Security**
  policies + RLS test script + deployment README in `supabase/`. This deployment uses local
  Prisma/SQLite with equivalent API-layer ownership enforcement (tested), because no Supabase
  project credentials exist in this environment.
- **RLS policy execution test** — `supabase/tests/rls-test.sql` documents the expected anon/A/B
  access matrix, but could not be *executed* here (no Postgres instance). Local ownership
  equivalents (user A vs user B isolation) are covered by the automated API suite.

## 3. Features requiring API credentials (honest unavailable states, integration ready)

| Feature | Env var | Obtain at |
|---|---|---|
| Municipal traffic cameras (optional upgrade over DeFlock/OSM) | `TRAFFIC_CAMERA_API_URL` (+ `TRAFFIC_CAMERA_API_KEY`) | e.g. WSDOT Traveler API — https://www.wsdot.wa.gov/traffic/api/ |
| Production database/auth | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | https://supabase.com/dashboard |
| Higher OpenSky rate limits (optional) | `AVIATION_PROVIDER_API_KEY` | https://opensky-network.org/my-opensky/api-client-credentials |

Until configured: the map runs on the keyless **DeFlock / OpenStreetMap ALPR inventory** (synced
locally — 145,091 cameras incl. 116,502 Flock Safety), Mapbox falls back to the keyless
OpenFreeMap dark basemap, and Supabase reports "Not configured — local persistence active".

## 4. Database setup

**This deployment (zero config):** Prisma + SQLite at `db/custom.db`.
```bash
bun install
bun run db:push        # create/sync schema
bun run dev            # start on :3000
```
Realtime service (required for live updates):
```bash
cd mini-services/realtime-service && bun install && bun run dev   # :3003 socket + :3004 control
```

**Production (Supabase):** see `supabase/README.md` —
`supabase db push` (or `psql -f supabase/migrations/001_init.sql`) applies all tables + RLS
policies, then set the three `SUPABASE_*` variables. RLS guarantees: rides/saved locations/user
settings owner-only; community data public read + owner write; camera & safety datasets read-only
for ordinary users.

## 5. Environment variables

Copy `.env.example` → `.env` (never committed; `.gitignore` covers `.env*`). Only `DATABASE_URL`
is required for the local deployment — every other key is optional and the app degrades honestly
without it. `NEXT_PUBLIC_*` values are public by design and never contain secrets; the service-role
Supabase key stays server-side only.

## 6. Testing results

| Check | Result |
|---|---|
| TypeScript (`bunx tsc --noEmit`, build errors NOT ignored) | ✅ 0 errors |
| ESLint (`bun run lint`) | ✅ 0 errors, 0 warnings |
| Automated API suite (`bun scripts/api-tests.mjs`) | ✅ **77/77 passed** — auth, rides CRUD + ownership isolation, reports/comments/confirmations/verification threshold/moderation, police-activity auto-expiry lifecycle, saved locations, external providers incl. DeFlock/OSM ALPR inventory (Atlanta bbox, brand + attribution + bbox bounds, ocean bbox = 0), status matrix, settings/export/delete cascade, client-bundle secret scan (5 pages + 31 scripts) |
| Browser E2E (agent-browser, desktop 1440×900 + mobile 390×844) | ✅ all routes render; map tiles pixel-verified; search/zoom/recenter/layers/report-submit/comment/resolve/settings-toggle/ride-lifecycle/recovery/presence/live-toast verified; 0 page errors |
| Realtime | ✅ presence sharing (marker + service state), cross-user event push |
| Secrets in client bundle | ✅ none found |
| Production build | Not run — `bun run build` is prohibited in this sandbox (dev-only policy). Equivalent static checks (tsc + eslint + runtime verification) all pass; `output: standalone` build config is prepared and `ignoreBuildErrors` is `false`. |

## 7. Known bugs / limitations

1. **OpenSky anonymous rate limits** — under heavy testing the anonymous quota was consumed; the
   aviation layer then shows "Provider rate limit reached" and renders no aircraft (correct,
   honest behavior). Resets with the provider's window or by configuring an API key.
2. **Rides page live route preview** is a lightweight SVG (no map tiles) — deliberate, keeps the
   page light; full route replay shows in the ride detail dialog.
3. **Comment "did I already confirm" state** is not returned by the API; the confirm action is an
   idempotent upsert (duplicate confirms don't double count).
4. **Overpass mirror reachability** varies by network: primary mirror `overpass.osm.ch` verified
   from this sandbox; `overpass-api.de` is blocked at network level here (automatic fallback chain
   implemented).
5. **Camera images** are never streamed — only documented locations + source links (privacy policy
   by design).
6. Avatars are URL-based (no file upload storage in this deployment).
7. **CARTO basemap tiles removed (2026-10 fix)** — CARTO started requiring an API key for
   `basemaps.cartocdn.com` raster tiles; without one it serves watermarked "API KEY REQUIRED"
   images that still answer HTTP 200 (so the old status ping falsely reported "connected"). The
   keyless basemap chain is now OpenFreeMap dark (vector, probed + parsed live at every map boot)
   → Esri World Dark Gray (raster, keyless last resort), with Mapbox dark-v11 still activating the
   moment `NEXT_PUBLIC_MAPBOX_TOKEN` is set. The `/api/status` basemap check now validates the
   style document / image content instead of trusting a bare HTTP 200.
8. **ALPR inventory freshness** — the DeFlock/OSM camera dataset is community-mapped, so coverage
   varies by region (dense in metros, sparse rural) and is only as current as the last sync.
   Refresh with `bun scripts/sync-alpr-cameras.ts` (auto-skips if synced within 7 days); the map
   panel always shows each camera's source and verification date.
9. **Police-activity sightings are unverified community reports** — they auto-expire after 2 h and
   are filtered server-side once expired, but accuracy depends on the reporting rider. No live
   law-enforcement position feed exists anywhere (by design — see API_RESEARCH.md §4).

## 8. How to start

```bash
bun install
bun run db:push                                          # local SQLite schema
bun scripts/sync-alpr-cameras.ts                         # DeFlock/OSM ALPR inventory (145k cameras)
bun run dev                                              # app on http://localhost:3000
cd mini-services/realtime-service && bun install && bun run dev   # realtime :3003/:3004
```

- Entry route `/` redirects to `/dashboard`.
- Create an account (username + password, 8+ chars) to track rides, report, comment and save
  locations — browsing works without one.
- Optional keys go in `.env` (see §5); the Settings → Connected APIs panel re-tests everything live.

## 9. Delivered artifacts

- **Application**: `src/` — 8 route pages, map engine (`src/components/map/`), 9 client service
  modules (`src/services/`), 10 API route groups (`src/app/api/`), external provider modules with
  timeout/retry/TTL-cache/freshness (`src/lib/external/`), scrypt auth (`src/lib/auth.ts`).
- **Realtime**: `mini-services/realtime-service/` (Socket.IO + control REST).
- **Database**: `prisma/schema.prisma` + `supabase/migrations/001_init.sql` (RLS) +
  `supabase/tests/rls-test.sql` + `supabase/README.md`.
- **Docs**: `DEVELOPMENT_PLAN.md`, `API_RESEARCH.md`, this report, `.env.example`.
- **Tests/tooling**: `scripts/api-tests.mjs` (77 assertions), `scripts/sync-alpr-cameras.ts`
  (DeFlock/OSM ALPR inventory sync), `scripts/reset-local-data.ts`,
  `scripts/sync-maplibre-worker.sh`.
