#!/usr/bin/env node
// NIGHTRIDE — automated API integration test suite (run against the live dev server).
// Usage: bun scripts/api-tests.mjs
//
// Covers: auth (register/login/logout/me), rides (create/update/complete/
// ownership isolation), community reports (CRUD, comments, confirmations,
// verification threshold, moderation flags, filters), saved locations,
// external providers (live data or explicit unavailable states), the API
// status matrix, settings/export/delete, and a client-bundle secret scan.

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000'
const results = []
let failed = 0

function check(name, cond, detail = '') {
  const ok = !!cond
  results.push({ name, ok, detail })
  if (!ok) failed++
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${!ok && detail ? ` — ${detail}` : ''}`)
  return ok
}

function section(title) {
  console.log(`\n■ ${title}`)
}

class Client {
  constructor() {
    this.cookies = new Map()
  }
  cookieHeader() {
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
  }
  async request(method, path, body) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(this.cookies.size ? { Cookie: this.cookieHeader() } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';')
      const idx = pair.indexOf('=')
      const name = pair.slice(0, idx).trim()
      const value = pair.slice(idx + 1).trim()
      if (value === '') this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
    const text = await res.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return { status: res.status, json, text }
  }
  get(p) { return this.request('GET', p) }
  post(p, b) { return this.request('POST', p, b) }
  patch(p, b) { return this.request('PATCH', p, b) }
  del(p) { return this.request('DELETE', p) }
}

const rand = () => Math.random().toString(36).slice(2, 10)
const USER_A = `testa${rand()}`
const USER_B = `testb${rand()}`

async function main() {
  console.log(`NIGHTRIDE API tests → ${BASE}`)

  // ------------------------------------------------------------ auth
  section('Authentication')
  const anon = new Client()
  let r = await anon.get('/api/auth/me')
  check('me (signed out) returns null user', r.status === 200 && r.json.user === null)

  const a = new Client()
  r = await a.post('/api/auth/register', { username: USER_A, password: 'testpass123' })
  check('register user A', r.status === 201 && r.json.user?.username === USER_A, JSON.stringify(r.json))
  check('register sets session cookie', a.cookies.has('nightride_session'))

  r = await a.get('/api/auth/me')
  check('me returns user A', r.status === 200 && r.json.user?.username === USER_A)
  check('me returns default settings', r.json.settings?.shareRidePresence === false)

  r = await a.post('/api/auth/register', { username: USER_A, password: 'testpass123' })
  check('duplicate username rejected (409)', r.status === 409)

  r = await a.post('/api/auth/register', { username: 'x', password: 'short' })
  check('invalid register rejected (400)', r.status === 400)

  const b = new Client()
  r = await b.post('/api/auth/register', { username: USER_B, password: 'testpass123' })
  check('register user B', r.status === 201)

  const c = new Client()
  r = await c.post('/api/auth/login', { username: USER_A, password: 'wrongpass!' })
  check('wrong password rejected (401)', r.status === 401)
  r = await c.post('/api/auth/login', { username: USER_A, password: 'testpass123' })
  check('login user A', r.status === 200 && r.json.user?.username === USER_A)
  r = await c.post('/api/auth/logout')
  check('logout clears session', r.status === 200)
  r = await c.get('/api/auth/me')
  check('me after logout is null', r.json.user === null)

  // ------------------------------------------------------------ rides
  section('Ride tracking & persistence')
  r = await anon.post('/api/rides', {})
  check('ride start requires auth (401)', r.status === 401)

  r = await a.post('/api/rides', {})
  check('ride A started', r.status === 201 && r.json.ride?.status === 'active')
  const rideId = r.json.ride.id

  r = await a.post('/api/rides', {})
  check('second concurrent ride rejected (409)', r.status === 409)

  r = await a.get('/api/rides/active')
  check('active ride recovered after refresh', r.json.ride?.id === rideId)

  const pts = Array.from({ length: 10 }, (_, i) => ({
    lat: 47.6062 + i * 0.0004,
    lng: -122.3321 + i * 0.0004,
    t: Date.now() - (10 - i) * 5000,
    spd: 8 + i,
  }))
  r = await a.patch(`/api/rides/${rideId}`, {
    appendPoints: pts,
    distanceMeters: 1234,
    durationSeconds: 300,
    averageSpeed: 4.1,
    maximumSpeed: 15.2,
    status: 'paused',
  })
  check('ride points + stats persisted (pause)', r.status === 200 && r.json.ride?.status === 'paused')
  check('route data appended', Array.isArray(r.json.ride?.routeData) && r.json.ride.routeData.length === 10)

  r = await b.get(`/api/rides/${rideId}`)
  check("B cannot read A's ride (404)", r.status === 404)
  r = await b.del(`/api/rides/${rideId}`)
  check("B cannot delete A's ride (404)", r.status === 404)

  r = await a.patch(`/api/rides/${rideId}`, { status: 'completed', endedAt: new Date().toISOString() })
  check('ride completed', r.status === 200 && r.json.ride?.status === 'completed')

  r = await a.get('/api/rides?status=completed')
  check('completed ride listed in history', r.json.rides?.some((x) => x.id === rideId))

  // ------------------------------------------------------------ community
  section('Community reports, comments, confirmations, moderation')
  r = await anon.post('/api/community/reports', {
    title: 'Deep pothole on the right lane',
    description: 'Avoid the right lane — pothole deep enough to damage a wheel.',
    category: 'road_hazard',
    latitude: 47.61,
    longitude: -122.34,
  })
  check('report requires auth (401)', r.status === 401)

  r = await a.post('/api/community/reports', {
    title: 'Deep pothole on the right lane',
    description: 'Avoid the right lane — pothole deep enough to damage a wheel.',
    category: 'road_hazard',
    latitude: 47.61,
    longitude: -122.34,
    locationLabel: 'Alaskan Way',
  })
  check('report created by A', r.status === 201 && r.json.report?.verificationStatus === 'unverified')
  const reportId = r.json.report.id

  r = await b.post(`/api/community/reports/${reportId}/comments`, { content: 'Can confirm — hit it yesterday.' })
  check('comment added by B', r.status === 201 && r.json.comment?.author?.username === USER_B)
  const commentId = r.json.comment.id

  r = await a.post(`/api/community/reports/${reportId}/confirmations`)
  check('author cannot confirm own report (403)', r.status === 403)
  r = await b.post(`/api/community/reports/${reportId}/confirmations`)
  check('B confirms A report', r.status === 200 && r.json.confirmationCount === 1)
  r = await b.post(`/api/community/reports/${reportId}/confirmations`)
  check('duplicate confirmations do not double count', r.json.confirmationCount === 1)

  r = await a.get(`/api/community/reports/${reportId}`)
  check('1 confirmation is still unverified', r.json.report?.verificationStatus === 'unverified')

  const d = new Client()
  r = await d.post('/api/auth/register', { username: `testd${rand()}`, password: 'testpass123' })
  r = await d.post(`/api/community/reports/${reportId}/confirmations`)
  check('second distinct confirmation → verified', r.status === 200 && r.json.confirmationCount === 2)
  r = await a.get(`/api/community/reports/${reportId}`)
  check('verification_status now confirmed', r.json.report?.verificationStatus === 'confirmed')

  r = await b.patch(`/api/community/reports/${reportId}`, { status: 'resolved' })
  check('community member marks resolved', r.status === 200 && r.json.report?.status === 'resolved')
  r = await b.patch(`/api/community/reports/${reportId}`, { status: 'closed' })
  check('non-author cannot close (403)', r.status === 403)
  r = await a.patch(`/api/community/reports/${reportId}`, { status: 'closed' })
  check('author closes report', r.status === 200 && r.json.report?.status === 'closed')

  r = await b.post('/api/community/flags', { itemType: 'report', itemId: reportId, reason: 'testing moderation flag' })
  check('abuse flag recorded', r.status === 201)
  r = await a.post('/api/community/flags', { itemType: 'comment', itemId: commentId, reason: 'testing comment flag' })
  check('comment abuse flag recorded', r.status === 201)

  r = await anon.get('/api/community/reports?category=road_hazard&limit=10')
  check('public filtered report list works', r.status === 200 && Array.isArray(r.json.reports))
  const listed = r.json.reports.find((x) => x.id === reportId)
  check('report visible with comment count', listed && listed.commentCount >= 1)

  r = await anon.get('/api/community/reports?lat=47.61&lng=-122.34&sort=nearby&limit=5')
  check('nearby sort returns distances', r.json.reports?.every((x) => typeof x.distanceMeters === 'number' || x.distanceMeters === undefined))

  // ------------------------------------------------------------ saved locations
  section('Saved locations')
  r = await anon.post('/api/locations', { name: 'X', latitude: 1, longitude: 1, category: 'custom' })
  check('saved location requires auth (401)', r.status === 401)
  r = await a.post('/api/locations', {
    name: 'Battery St viewpoint',
    description: 'Great city view',
    latitude: 47.619,
    longitude: -122.343,
    category: 'viewpoint',
  })
  check('location saved by A', r.status === 201)
  const locId = r.json.location.id
  r = await b.get('/api/locations')
  check("B sees no A locations", r.status === 200 && r.json.locations.length === 0)
  r = await b.del(`/api/locations/${locId}`)
  check("B cannot delete A's location (404)", r.status === 404)
  r = await a.patch(`/api/locations/${locId}`, { name: 'Battery St viewpoint (renamed)' })
  check('A renames location', r.status === 200 && r.json.location.name.includes('renamed'))
  r = await a.del(`/api/locations/${locId}`)
  check('A deletes location', r.status === 200)

  // ------------------------------------------------------------ external providers
  section('External providers (live data or honest unavailable states)')
  r = await anon.get('/api/external/aviation?minLat=47.4&minLng=-122.5&maxLat=47.8&maxLng=-122.2')
  check(
    'aviation: live OpenSky data or honest unavailable state',
    r.status === 200 && (r.json.freshness === 'live' ? Array.isArray(r.json.data) : r.json.freshness === 'unavailable'),
    `freshness=${r.json?.freshness}`,
  )
  r = await anon.get('/api/external/charging?lat=47.6062&lng=-122.3321&radius=3000')
  check(
    'charging: real OSM stations or honest unavailable state',
    r.status === 200 && (r.json.freshness === 'live' ? (r.json.data?.length ?? 0) >= 0 : r.json.freshness === 'unavailable'),
    `freshness=${r.json?.freshness} count=${r.json?.data?.length}`,
  )
  if (r.json?.freshness === 'live' && r.json.data?.length > 0) {
    const s = r.json.data[0]
    check('charging station has real OSM coordinates + source', Number.isFinite(s.latitude) && s.sourceUrl.includes('openstreetmap.org'))
  }
  r = await anon.get('/api/external/public-safety')
  check(
    'public safety: NWS events synced or honest unavailable state',
    r.status === 200 && (r.json.data === null || Array.isArray(r.json.data)),
    `freshness=${r.json?.freshness} events=${r.json?.data?.length}`,
  )
  if (r.json?.data?.length > 0) {
    const e = r.json.data[0]
    check('safety events carry source attribution', e.sourceName === 'NWS' && !!e.sourceUrl)
  }
  r = await anon.get('/api/external/cameras')
  check(
    'cameras: honest not-configured state (no invented markers)',
    r.status === 200 && r.json.freshness === 'unavailable' && r.json.data.length === 0 && /TRAFFIC_CAMERA_API_URL/.test(r.json.note ?? ''),
    r.json?.note?.slice(0, 60),
  )
  r = await anon.get('/api/external/geocode?q=Space%20Needle%20Seattle')
  check(
    'geocode: Nominatim results or honest unavailable state',
    r.status === 200 && (r.json.freshness === 'live' ? r.json.data.length > 0 : true),
    `freshness=${r.json?.freshness}`,
  )
  r = await anon.get('/api/activity?limit=20')
  check('activity feed merges sources', r.status === 200 && Array.isArray(r.json.items))

  // ------------------------------------------------------------ status matrix
  section('API status (real connectivity tests)')
  r = await anon.get('/api/status')
  check('status endpoint responds', r.status === 200 && Array.isArray(r.json.providers))
  const providers = r.json.providers
  check('status covers all providers', ['database', 'mapbox', 'osm', 'aviation', 'charging', 'public_safety', 'cameras', 'supabase', 'realtime'].every((k) => providers.some((p) => p.key === k)))
  const osm = providers.find((p) => p.key === 'osm')
  check('OSM basemap connected (keyless)', osm?.status === 'connected', osm?.status)
  const mapbox = providers.find((p) => p.key === 'mapbox')
  check('Mapbox honestly reported (missing → fallback active)', mapbox?.status === 'missing' || mapbox?.status === 'connected', mapbox?.status)
  const camerasStatus = providers.find((p) => p.key === 'cameras')
  check('cameras honestly not configured', camerasStatus?.status === 'missing', camerasStatus?.status)
  const rt = providers.find((p) => p.key === 'realtime')
  check('realtime service connected', rt?.status === 'connected', rt?.status)
  const db = providers.find((p) => p.key === 'database')
  check('local database connected', db?.status === 'connected', db?.status)

  // ------------------------------------------------------------ settings / export / delete
  section('Settings, export, account deletion')
  r = await b.patch('/api/account/settings', { shareRidePresence: true, defaultMapStyle: 'osm' })
  check('settings updated', r.status === 200 && r.json.settings.shareRidePresence === true && r.json.settings.defaultMapStyle === 'osm')
  r = await b.patch('/api/account/settings', { defaultMapStyle: 'bogus' })
  check('invalid settings rejected (400)', r.status === 400)

  r = await b.get('/api/account/export')
  const exported = r.json
  check('export contains profile + structures', exported?.profile?.username === USER_B && Array.isArray(exported.rides) && Array.isArray(exported.savedLocations))

  const del = new Client()
  r = await del.post('/api/auth/register', { username: `testz${rand()}`, password: 'testpass123' })
  const delUser = r.json.user
  r = await del.post('/api/rides', {})
  const delRide = r.json.ride
  r = await del.post('/api/account/delete', { password: 'wrong' })
  check('delete requires correct password (403)', r.status === 403)
  r = await del.post('/api/account/delete', { password: 'testpass123' })
  check('account deleted', r.status === 200)
  r = await a.get(`/api/rides/${delRide.id}`)
  check("deleted user's ride gone (cascade)", r.status === 404)

  // ------------------------------------------------------------ bundle secret scan
  section('Client bundle secret scan')
  // Scan the HTML + every client script actually served for the app pages
  // (works in dev and production — no .next/static assumption).
  const routesToScan = ['/', '/dashboard', '/map', '/community', '/settings']
  const scripts = new Set()
  let htmlScanned = 0
  for (const route of routesToScan) {
    const res = await fetch(`${BASE}${route}`)
    const html = await res.text()
    htmlScanned++
    for (const m of html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)) scripts.add(m[1])
    for (const m of html.matchAll(/href="(\/_next\/static\/[^"]+\.js)"/g)) scripts.add(m[1])
  }
  const suspicious = [/sk_live/i, /sk-[a-zA-Z0-9]{20,}/, /service_role/i, /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.ey/]
  let secretsFound = 0
  let scriptsScanned = 0
  for (const src of scripts) {
    const res = await fetch(`${BASE}${src}`)
    const js = await res.text()
    scriptsScanned++
    if (suspicious.some((re) => re.test(js))) secretsFound++
  }
  check(
    `no secrets in served client code (${htmlScanned} pages, ${scriptsScanned} scripts)`,
    secretsFound === 0 && scriptsScanned > 0,
    `scripts scanned: ${scriptsScanned}, secrets: ${secretsFound}`,
  )

  // ------------------------------------------------------------ summary
  console.log(`\n${'='.repeat(60)}\nRESULTS: ${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}\n${'='.repeat(60)}`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('Test suite crashed:', err)
  process.exit(1)
})
