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
| Endpoints used | `https://tiles.openfreemap.org/styles/dark` (vector style + `…/planet` tiles), `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_{Base,Reference}/MapServer/tile/{z}/{y}/{x}` (raster fallback), `https://nominatim.openstreetmap.org/search|reverse?…` , `https://overpass.osm.ch/api/interpreter?data=[out:json];node[amenity=charging_station](around:…);out;` |
| Data fields | Nominatim: lat/lon, display_name, type, class. Overpass: id, lat, lon, tags (operator, capacity, socket types) |
| Update frequency | OpenFreeMap ≈ weekly OSM planet refresh; Nominatim ≈ real-time OSM replication; Overpass mirrors ≈ minutes behind OSM |
| Coverage | Global |
| Pricing | Free (OpenFreeMap free incl. commercial use; Esri public canvas tiles free with attribution) |
| Rate limits | OpenFreeMap: no hard limit, fair use. Nominatim: max 1 req/s, custom User-Agent mandatory. Overpass: 2 concurrent slots, be gentle; mirror `overpass.osm.ch` verified reachable from this sandbox (`overpass-api.de` is blocked at network level here) |
| Commercial use | Allowed with ODbL attribution; heavy commercial use of public Nominatim is not allowed (self-host recommended) |
| Redistribution | ODbL 1.0 — attribution "© OpenStreetMap contributors" mandatory; Esri tiles additionally "Tiles © Esri" |
| Difficulty | 🟢 |
| **Live test** | OpenFreeMap `styles/dark` `200 OK` (valid MapLibre style, background `rgb(12,12,12)`) · Esri Dark_Gray_Base tile `200 OK` (`image/jpeg`) + Reference tile `200 OK` (`image/png`) · Nominatim search `200 OK` (608 ms, real result) · `overpass.osm.ch` `200 OK` (778 ms) · `overpass-api.de`, `overpass.kumi.systems`, `overpass.private.coffee` **blocked** in this sandbox |

> **⚠ CARTO basemap tiles removed (2026-10):** `basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png`
> now serves watermarked **"API KEY REQUIRED"** images (HTTP 200!) unless a CARTO API key is
> supplied — a plain HTTP ping therefore *falsely* passes. Keyless CARTO tiles were replaced by
> OpenFreeMap dark (vector, probed + parsed live before the map boots) with Esri World Dark Gray
> raster as the guaranteed keyless last resort. A CARTO key can be reintroduced as an optional
> provider later if desired; Mapbox remains the optional premium path (`NEXT_PUBLIC_MAPBOX_TOKEN`).

**Chosen strategy:** MapLibre GL renders Mapbox dark-v11 when a token is present; otherwise the
keyless OpenFreeMap dark vector style (fetched + validated client-side at boot), falling back to
keyless Esri World Dark Gray raster tiles when OpenFreeMap is unreachable. Map search uses
server-proxied Nominatim with a 24 h cache and min-interval guard; charging stations use
`overpass.osm.ch` with automatic fallback mirrors and a 10 min cache.

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
| Traffic cameras | WSDOT-style provider module | **Not configured** (explicit state) — table ready for verified inventories |
| Road hazards | Community reports (DB) | Live |
| Road closures | Community reports (DB) | Live |
| Charging stations | Overpass `overpass.osm.ch` (OSM POIs) | Live (verified) |
| Legal riding areas | Community reports (DB) | Live |
| Aviation awareness | OpenSky Network anonymous | Live (verified) |
| Public safety announcements | NWS active alerts (synced to DB) | Live (verified) |
| Map search / reverse geocode | Nominatim (server-proxied, cached) | Live (verified) |
| Database | Supabase Postgres (production) / Prisma SQLite (this deployment) | Supabase: migrations + RLS provided, awaiting project keys |

## 6. Integration standards applied to every provider

Dedicated typed service module · typed response interfaces · `AbortController` timeouts (8–10 s) ·
single retry with backoff for idempotent GETs · TTL server cache with freshness classification
(Live / Delayed / Stale / Unavailable from real response age) · loading states in UI ·
last-updated timestamps displayed · source attribution rendered next to data · rate-limit guards
(Nominatim min-interval, OpenSky 10 s cache, 429-aware).
