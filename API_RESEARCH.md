# NIGHTRIDE — API RESEARCH (Phase 4)

Every provider below was researched from **official documentation** and, where possible, verified
with a **live connectivity test from the deployment sandbox** (results quoted with HTTP status and
latency). No endpoint URL in the application is guessed; no credential is fabricated.

Legend for integration difficulty: 🟢 low (no key, REST/JSON) · 🟡 medium (free key required) · 🔴 high (commercial contract).

---

## 1. Mapping providers

### 1.1 Mapbox

| Field | Value |
|---|---|
| Provider | Mapbox (Mapbox GL JS / Styles API / Raster Tiles API) |
| Official docs | https://docs.mapbox.com/api/maps/ (styles), https://docs.mapbox.com/mapbox-gl-js/ |
| Authentication | Access token (public `pk.` token for client-side tile/style requests) |
| Credentials needed | One public token (`NEXT_PUBLIC_MAPBOX_TOKEN`) |
| Endpoints used | `GET https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}@2x?access_token=…` (dark basemap tiles), `GET /styles/v1/mapbox/dark-v11?access_token=…` (style manifest) |
| Data fields | Raster tiles 512 px; style manifest JSON for the connectivity test |
| Update frequency | Static basemap (styles versioned, e.g. `dark-v11`) |
| Coverage | Global |
| Pricing | Free tier ≈ 50k map loads/month (non-commercial), then pay-as-you-go map-load pricing |
| Rate limits | Token-scoped; 50k free loads; sustained ≈ thousands/min depending on plan |
| Commercial use | Allowed under Mapbox ToS with paid plan |
| Redistribution | Tiles may be displayed, not bulk-redistributed or cached > 7 days |
| Difficulty | 🟡 |
| **Live test** | `401` without token (expected) — integration coded and active the moment a token is supplied |
| Notes | Public `pk.` tokens are **not secrets** (safe in `NEXT_PUBLIC_*`), but must never grant secret scopes. |

### 1.2 OpenStreetMap basemaps + Nominatim + Overpass

| Field | Value |
|---|---|
| Provider | OpenStreetMap data — OpenFreeMap dark vector basemap (primary keyless), Esri World Dark Gray raster (keyless fallback), Nominatim geocoding, Overpass POI extraction |
| Official docs | https://openfreemap.org/docs/ , https://github.com/openmaptiles , https://server.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer , https://wiki.openstreetmap.org/wiki/Raster_tile_providers , https://nominatim.org/release-docs/latest/api/ , https://wiki.openstreetmap.org/wiki/Overpass_API |
| Authentication | None (usage policy compliance instead) |
| Credentials needed | None |
| Endpoints used | `https://tiles.openfreemap.org/styles/dark` (vector style + `…/planet` tiles), `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_{Base,Reference}/MapServer/tile/{z}/{y}/{x}` (raster fallback), `https://nominatim.openstreetmap.org/search|reverse?…` , `https://photon.komoot.io/api/?q=…&lat=…&lon=…&bbox=…` , `https://overpass-api.de/api/interpreter` (mirror chain, see below) |
| Data fields | Nominatim: lat/lon, display_name, type, class. Photon: osm_key/osm_value, name, address parts. Overpass: id, lat, lon, tags (operator, capacity, socket types) |
| Update frequency | OpenFreeMap ≈ weekly OSM planet refresh; Nominatim ≈ real-time OSM replication; Photon ≈ daily OSM import; Overpass mirrors ≈ minutes behind OSM |
| Coverage | Global |
| Pricing | Free (OpenFreeMap free incl. commercial use; Esri public canvas tiles free with attribution) |
| Rate limits | OpenFreeMap: no hard limit, fair use. Nominatim: max 1 req/s, custom User-Agent mandatory. Photon (komoot public instance): moderate use, descriptive User-Agent. Overpass: 2 concurrent slots, be gentle |
| Commercial use | Allowed with ODbL attribution; heavy commercial use of public Nominatim is not allowed (self-host recommended) |
| Redistribution | ODbL 1.0 — attribution "© OpenStreetMap contributors" mandatory; Esri tiles additionally "Tiles © Esri" |
| Difficulty | 🟢 |
| **Live test** | OpenFreeMap `styles/dark` `200 OK` (valid MapLibre style, background `rgb(12,12,12)`) · Esri Dark_Gray_Base tile `200 OK` (`image/jpeg`) + Reference tile `200 OK` (`image/png`) · Nominatim search `200 OK` (608 ms, real result) · Photon search `200 OK` (~1 s, real POIs) · Overpass mirror chain verified (see mirror notes below) |

> **⚠ CARTO basemap tiles removed (2026-10):** `basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png`
> now serves watermarked **"API KEY REQUIRED"** images (HTTP 200!) unless a CARTO API key is
> supplied — a plain HTTP ping therefore *falsely* passes. Keyless CARTO tiles were replaced by
> OpenFreeMap dark (vector, probed + parsed live before the map boots) with Esri World Dark Gray
> raster as the guaranteed keyless last resort. A CARTO key can be reintroduced as an optional
> provider later if desired; Mapbox remains the optional premium path (`NEXT_PUBLIC_MAPBOX_TOKEN`).

**Chosen strategy (§1.2):** MapLibre GL renders Mapbox dark-v11 when a token is present; otherwise the
keyless OpenFreeMap dark vector style (fetched + validated client-side at boot), falling back to
keyless Esri World Dark Gray raster tiles when OpenFreeMap is unreachable. Map search uses
server-proxied Nominatim + Photon with a 24 h cache and min-interval guard; charging stations use
the global Overpass mirror chain with a 10 min cache.

**Overpass mirror findings (2026-11, verified from this sandbox):**

| Mirror | Status | Notes |
|---|---|---|
| `overpass-api.de` | ⛔ blocked here | canonical, fast, global — first in the chain for deployed environments |
| `maps.mail.ru/osm/tools/overpass` | ⚠ intermittent | global (VK Maps), ~20 s per query, bursty 504 s under load |
| `overpass.kumi.systems` | ⛔ blocked here | global spare, last in the chain |
| `overpass.osm.ch` | ❌ removed | **Switzerland-only extract** — returns `0 elements` (HTTP 200) for any query outside CH, which silently produced empty charging layers worldwide. Regional extracts are never used. |
| `overpass.osm.jp` | ❌ rejected | TLS certificate expired at time of testing |

**Brand-POI search (2026-11):** two findings fixed the "search can't find Smith's / McDonald's"
complaint. (1) Nominatim matches literal names — `mcdonalds` returns **nothing** while `McDonald's`
returns 10 restaurants, `smiths` returns a *locality* while `Smith's` returns the supermarkets; the
geocoder now pools an apostrophe-variant of the query (trailing `…s` → `…'s`) with the original.
(2) Photon (komoot) is a POI/brand-focused geocoder with `lat`/`lon` bias + `bbox` + `osm_tag`
filters; the biased search merges Nominatim (addresses, streets) with Photon (brand POIs),
dedupes by proximity and sorts by real distance. Both engines degrade independently
(`Promise.allSettled`) — when Photon is unreachable the apostrophe-smart Nominatim path alone
still finds brand POIs.

**Nearby category chips (2026-11):** `/api/external/pois?lat=&lng=&category=food|coffee|groceries|fuel|atm|hotel`
powers one-tap "near me" browsing. Engine = Nominatim category words ("restaurant", "gas
station", …, bounded ±35 km, limit 30 — Nominatim ranks by *relevance*, so the pool needs depth
for the distance sort to surface near places) merged best-effort with a Photon brand-term fan-out
(~10 parallel terms/category), deduped, OSM-type-filtered (an arts centre matching "bank" is
dropped — no keyword drift), capped to ~30 km riding distance, sorted nearest-first, cached 6 h.
Empty results are returned live but never cached, so a provider blip can't freeze a "no results"
answer for hours.

**Location-biased search (2026-11):** when the rider has a GPS fix the map search sends `lat`/`lng`
along with `q`; the proxy boxes the query to ±35 km around the rider (`viewbox` + `bounded=1`,
falling back to `bounded=0` when the strict box finds nothing), computes great-circle distances
per result and returns them sorted nearest-first. Verified live: `?q=coffee&lat=34.0522&lng=-118.2437`
→ nearest match ≈ 1 km, all distances finite and ascending.

### 1.3 DeFlock / OpenStreetMap ALPR cameras (CHOSEN — keyless)

| Field | Value |
|---|---|
| Provider | DeFlock — community-mapped ALPR camera inventory built on OpenStreetMap tags (man_made=surveillance, surveillance=ALPR) |
| Official docs | https://deflock.org , https://maps.deflock.org , https://wiki.openstreetmap.org/wiki/Tag:man_made%3Dsurveillance |
| Authentication | None |
| Credentials needed | None |
| Endpoints used | `GET https://data.dontgetflocked.com/cameras.geojson.gz` (full dump, ~37 MB) — served via browser-UA requests; the interactive map's API (`api.dontgetflocked.com`) is Cloudflare-protected and NOT used |
| Data fields | FeatureCollection → Point coordinates + osmId/osmType/osmTimestamp, brand (Flock Safety, Motorola Solutions, Genetec, Axis, Leonardo), ref, startDate |
| Dataset size | 145,091 cameras (116,502 Flock Safety) as of 2026-11 |
| Update frequency | Community-mapped; dump refreshed periodically (OSM timestamps per feature) |
| Coverage | US + parts of CA/EU — dense in metros, sparse rural |
| Pricing | Free (ODbL via OpenStreetMap) |
| Rate limits | None documented for the static dump — synced server-side into the local DB and served bbox-filtered from there, so riders never hit the CDN |
| Commercial use | ODbL 1.0 attribution: "© OpenStreetMap contributors · DeFlock (deflock.org)" |
| Difficulty | 🟢 |
| **Live test** | Full dump downloaded (37.1 MB → 145,091 features); Atlanta bbox query returns 1,281 cameras (357 Flock in a tighter viewport); ocean bbox returns 0 (never invented) |

**Chosen strategy:** the dump is synced server-side into `public_camera_locations`
(`bun scripts/sync-alpr-cameras.ts`, auto-skips within 7 days) and the map queries the local DB
per viewport (cap 750). Camera markers show brand, type (ALPR vs traffic), source and verification
date; no live video feed is ever accessed.

> **Why not a live police-location feed:** no law-enforcement agency publishes real-time unit
> positions, and NIGHTRIDE's spec explicitly forbids identifying/following law-enforcement aircraft
> or bypassing privacy restrictions. Police presence is therefore handled as **transient community
> sightings** (the `police_activity` report category, auto-expiring after 2 h) — the same model
> Waze and Exit51 use. The aviation layer shows all ADS-B aircraft equally (OpenSky), with no
classification or targeting of law-enforcement flights.

---

### 1.4 OSRM routing (CHOSEN — keyless)

| Field | Value |
|---|---|
| Provider | OSRM — Open Source Routing Machine, public demo server (car profile, OSM road data) |
| Official docs | https://project-osrm.org/docs/v5.24.0/api/ , https://github.com/Project-OSRM/osrm-backend |
| Authentication | None |
| Credentials needed | None (`OSRM_BASE_URL` optionally repoints at a self-hosted instance) |
| Endpoints used | `https://router.project-osrm.org/route/v1/driving/{lng},{lat};{lng},{lat}?overview=full&geometries=geojson&alternatives=2&steps=false` |
| Data fields | routes[]: distance (m), duration (s), geometry.coordinates [lng,lat][]; waypoints |
| Update frequency | Demo server follows OSM data ≈ weekly; routing graph refreshed periodically |
| Coverage | Global road network (car profile) |
| Pricing | Free demo service — **no SLA**; production use requires self-hosting (docker-osrm) |
| Rate limits | No published hard limit; fair use only — the app caches each origin/destination pair for 10 min and quantizes the origin to ~110 m so a ticking GPS watcher does not spam it |
| Commercial use | Allowed (ODbL attribution); demo server is explicitly not for production |
| Redistribution | Routing © OpenStreetMap contributors, ODbL — OSRM |
| Difficulty | 🟢 |
| **Live test** | `route/v1/driving` LA downtown → Griffith Park `200 Ok` (767 ms, real geometry, alternatives present); mid-Pacific query returns `NoRoute` → surfaced as honest `unavailable`, never invented |

**Chosen strategy:** choosing a destination (search result, clicked point → "Route here") plans the
fastest route from the rider's live GPS position plus up to 2 alternatives, sorted by travel time.
The fastest option is highlighted on the map (bright line + dark casing), alternatives render as
dashed dim lines; the panel lets the rider switch between them. Reroute triggers on destination
change or >~110 m origin movement. Failures (demo server down, `NoRoute`) surface as an honest
"Routing unavailable" state — geometry is never invented.

---

## 2. Aviation providers

### 2.1 OpenSky Network (CHOSEN)

| Field | Value |
|---|---|
| Provider | OpenSky Network |
| Official docs | https://openskynetwork.github.io/opensky-api/rest.html |
| Authentication | Anonymous allowed; optional OAuth2 client credentials raise limits |
| Credentials needed | None for anonymous (`AVIATION_PROVIDER_API_KEY` optional) |
| Endpoints used | `GET https://opensky-network.org/api/states/all?lamin&lomin&lamax&lomax` |
| Data fields | `time`, `states[]`: icao24, callsign, origin_country, time_position, last_contact, longitude, latitude, baro_altitude, on_ground, velocity (m/s), true_track, vertical_rate, geo_altitude |
| Update frequency | ≈ 10 s (anonymous resolution) |
| Coverage | Global (ADS-B receivers; coverage varies by region) |
| Pricing | Free (anonymous ≈ 400 credits/day; auth users more; feeding receivers grants more) |
| Rate limits | Anonymous ≈ 400 credits/day; 429 responses must be handled |
| Commercial use | Research/non-commercial focus for free tier; commercial via contact |
| Redistribution | Live state vectors may be displayed, not bulk-redistributed |
| Difficulty | 🟢 |
| **Live test** | `200 OK` (0.54–0.62 s) — 12 aircraft returned for Seattle bbox; sampled twice, stable |
| **Ethics constraint (spec)** | Used for **general air-traffic awareness only**. No callsign-based filtering, no law-enforcement aircraft identification, no following of individual blocked/privacy-restricted aircraft. UI shows aggregate altitude/velocity-coded traffic dots. |

### 2.2 Flightradar24

| Field | Value |
|---|---|
| Official docs | https://www.flightradar24.com/ (no public REST docs; enterprise API on request) |
| Authentication | Commercial API key |
| Credentials needed | Paid/enterprise agreement |
| Endpoints | Not publicly documented |
| Pricing | Commercial |
| Notes | **Not integrated** — no public API; scraping prohibited by ToS. |

### 2.3 AviationStack

| Field | Value |
|---|---|
| Official docs | https://aviationstack.com/documentation |
| Authentication | API key |
| Endpoints | `/flights`, `/routes`, … (flight status focused, not live radar-style state vectors on free tier) |
| Pricing | Free tier 100 req/month (no live flights on free plan), paid tiers |
| Rate limits | Plan-based |
| Difficulty | 🟡 |
| Notes | **Not integrated** — free tier excludes the live positions NIGHTRIDE needs; documented as alternative. `AVIATION_PROVIDER_BASE_URL` config slot reserved. |

---

## 3. Public traffic camera information

| Field | Value |
|---|---|
| Candidate providers | WSDOT Traveler Information API (WA), NYC DOT/TMC, 511 systems (511.org, AZ511, CA DOT) |
| Official docs | https://www.wsdot.wa.gov/traffic/api/ (e.g. `GET /TrafficAPI/TrafficCameras/CamerasJSON?AccessCode=…`) |
| Authentication | WSDOT: free `AccessCode`; 511.org: developer keys; NYC public JSON endpoint exists but was unreachable from this sandbox |
| Credentials needed | `TRAFFIC_CAMERA_API_URL` + `TRAFFIC_CAMERA_API_KEY` |
| Data fields | Camera id, title/name, latitude, longitude, image URL, read time, region |
| Update frequency | Camera inventory ≈ static; image frames seconds-to-minutes |
| Coverage | Provider-specific (state/municipal) |
| Pricing | Free for public traveler information (WSDOT AccessCode is free) |
| Rate limits | Unpublished, generous for traveler info |
| Commercial use | Per-provider terms |
| Redistribution | Camera metadata may be displayed with attribution; image streams remain provider property |
| Difficulty | 🟡 |
| **Live test** | No credentials configured → integration ships as a **fully coded service module** (`src/lib/external/cameras.ts`) with the layer showing an explicit "Not configured" state. A `public_camera_locations` table exists for verified inventories (with `source_url` + `last_verified_at`); it ships **empty** — no invented coordinates. |
| **Ethics constraint (spec)** | Only documented public traffic cameras. No restricted feeds, no discovery of private surveillance. |

---

## 4. Public safety information

### 4.1 NWS Active Alerts (CHOSEN)

| Field | Value |
|---|---|
| Provider | National Weather Service (api.weather.gov) — official US government feed |
| Official docs | https://www.weather.gov/documentation/services-web-api |
| Authentication | None — custom `User-Agent` header required (future API key planned) |
| Credentials needed | None |
| Endpoints used | `GET https://api.weather.gov/alerts/active?status=actual` (Accept: application/geo+json) |
| Data fields | `event`, `headline`, `description`, `severity`, `urgency`, `areaDesc`, `effective`, `onset`, `expires`, `id`, geometry (optional) |
| Update frequency | Real-time (cache-friendly `expires` headers) |
| Coverage | United States (all NWS zones) |
| Pricing | Free — public domain (US Gov work) |
| Rate limits | Unpublished but generous; 5 s retry hint on limit; unique UA avoids blocks |
| Commercial use | Free for any purpose |
| Redistribution | Public domain — attribution appreciated ("NWS") |
| Difficulty | 🟢 |
| **Live test** | `200 OK` (0.87 s) — 377 active alerts; parameter `limit` rejected (documented quirk handled) |

### 4.2 Road closure datasets (documented alternatives)

- WSDOT Traveler Alerts API (same AccessCode as cameras) — alerts, closures, construction.
- 511 systems (511.org Bay Area, AZ511, WSDOT, NY511) — public datasets, keys vary.
- NIGHTRIDE handles road closures from two honest sources: (a) community reports
  (category *road closure*) and (b) any configured official feed via the reserved
  `TRAFFIC_CAMERA_API_URL`-style config. **Spec constraint honored:** no individual law-enforcement
  movement tracking anywhere; only aggregated official feeds and community reports.

---

## 5. Chosen integration matrix

| Layer | Provider | Mode in this deployment |
|---|---|---|
| Basemap | Mapbox dark-v11 → OpenFreeMap dark (keyless vector) → Esri World Dark Gray (keyless raster) | OpenFreeMap live now (probed each boot); Mapbox ready, awaiting token |
| Rider locations | Socket.IO presence, explicit consent | Live (empty unless riders consent — by design) |
| Traffic cameras / ALPR | DeFlock · OpenStreetMap (keyless, synced) → optional municipal provider | **Live** — 145,091 ALPR cameras synced (116,502 Flock Safety) |
| Road hazards | Community reports (DB) | Live |
| Road closures | Community reports (DB) | Live |
| Charging stations | Overpass global mirror chain (`overpass-api.de` → `maps.mail.ru` → `kumi.systems`) | Live (verified) — regional `osm.ch` extract removed (it returned empty outside Switzerland) |
| Legal riding areas | Community reports (DB) | Live |
| Police activity | Community reports (transient, 2 h auto-expiry) | Live — no live law-enforcement feed exists or is used (by design) |
| Aviation awareness | OpenSky Network anonymous | Live (verified) |
| Public safety announcements | NWS active alerts (synced to DB) | Live (verified) |
| Map search / reverse geocode | Nominatim **+ Photon** merge (server-proxied, cached) — **brand-POI + apostrophe-variant aware since 2026-11** ("smiths" → Smith's supermarkets, "mcdonalds" → McDonald's) | Live (verified) |
| Nearby category browse | `/api/external/pois` — Nominatim category words + Photon brand fan-out, OSM-type-filtered, ≤30 km, distance-sorted | Live (verified) — Food/Coffee/Groceries/Fuel/ATM/Hotel chips |
| Fastest routes / navigation | OSRM public demo (car profile, `alternatives=2`), server-proxied + 10 min cache | Live (verified) — honest `unavailable` on `NoRoute`/outage, geometry never invented |
| Database | Supabase Postgres (production) / Prisma SQLite (this deployment) | Supabase: migrations + RLS provided, awaiting project keys |

## 6. Integration standards applied to every provider

Dedicated typed service module · typed response interfaces · `AbortController` timeouts (8–10 s) ·
single retry with backoff for idempotent GETs · TTL server cache with freshness classification
(Live / Delayed / Stale / Unavailable from real response age) · loading states in UI ·
last-updated timestamps displayed · source attribution rendered next to data · rate-limit guards
(Nominatim min-interval, OpenSky 10 s cache, 429-aware).
