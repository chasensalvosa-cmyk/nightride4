// NIGHTRIDE realtime service
//
// Two listeners (engine.io claims every request whose URL starts with the
// socket path "/", so the control REST API needs its own port):
//
//   :3003  Socket.IO (path "/") — browser clients connect through the
//          gateway via  io("/?XTransformPort=3003")
//   :3004  Control REST (localhost only)
//            POST /broadcast { event, data }  — used by the Next.js API
//            GET  /health                     — used by the status page
//
// Responsibilities:
//   1. Broadcast domain events (community reports, comments, safety alerts)
//      pushed by the API layer — clients get pushes instead of polling.
//   2. Consent-gated rider presence: riders explicitly sharing their
//      location during a ride emit 'presence:share'; an in-memory TTL map
//      (60 s) is pushed as 'presence:update'. Never written to disk.
//   3. Health endpoint for the real connectivity test in /api/status.

import { createServer } from 'http'
import { Server } from 'socket.io'

const SOCKET_PORT = 3003
const CONTROL_PORT = 3004
const PRESENCE_TTL_MS = 60_000
const PRESENCE_MIN_INTERVAL_MS = 3000

interface RiderPresence {
  userId: string
  username: string
  lat: number
  lng: number
  heading: number | null
  speedKmh: number | null
  updatedAt: number
}

// ------------------------------------------------------------------ socket.io

const io = new Server({
  // Path must remain '/' — the Caddy gateway routes by XTransformPort.
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

const riders = new Map<string, RiderPresence>() // socketId → presence
const lastShareAt = new Map<string, number>()
let presenceDirty = false

function broadcastPresence() {
  io.emit('presence:update', Array.from(riders.values()))
  presenceDirty = false
}

setInterval(() => {
  const now = Date.now()
  let changed = false
  for (const [socketId, p] of riders) {
    if (now - p.updatedAt > PRESENCE_TTL_MS) {
      riders.delete(socketId)
      lastShareAt.delete(socketId)
      changed = true
    }
  }
  if (changed || presenceDirty) broadcastPresence()
}, 4000)

io.on('connection', (socket) => {
  socket.on('presence:share', (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return
    const p = raw as Record<string, unknown>
    const lat = typeof p.lat === 'number' ? p.lat : NaN
    const lng = typeof p.lng === 'number' ? p.lng : NaN
    const userId = typeof p.userId === 'string' ? p.userId.slice(0, 64) : ''
    const username = typeof p.username === 'string' ? p.username.slice(0, 30) : ''
    if (
      !userId ||
      !username ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return
    }

    // Rate limit per socket.
    const now = Date.now()
    const last = lastShareAt.get(socket.id) ?? 0
    if (riders.has(socket.id) && now - last < PRESENCE_MIN_INTERVAL_MS) return
    lastShareAt.set(socket.id, now)

    riders.set(socket.id, {
      userId,
      username,
      lat,
      lng,
      heading: typeof p.heading === 'number' ? p.heading : null,
      speedKmh: typeof p.speedKmh === 'number' ? p.speedKmh : null,
      updatedAt: now,
    })
    broadcastPresence()
  })

  socket.on('presence:stop', () => {
    if (riders.delete(socket.id)) {
      lastShareAt.delete(socket.id)
      broadcastPresence()
    }
  })

  socket.on('disconnect', () => {
    if (riders.delete(socket.id)) {
      lastShareAt.delete(socket.id)
      broadcastPresence()
    }
  })
})

io.listen(SOCKET_PORT, () => {
  console.log(`[nightride-realtime] socket.io listening on :${SOCKET_PORT} (path "/")`)
})

// ------------------------------------------------------------------ control REST

const control = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${CONTROL_PORT}`)

  if (url.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: true,
        service: 'nightride-realtime',
        connections: io.engine.clientsCount,
        ridersSharing: riders.size,
        uptime: process.uptime(),
      }),
    )
    return
  }

  if (url.pathname === '/broadcast' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 1_000_000) req.destroy() // 1 MB guard
    })
    req.on('end', () => {
      try {
        const { event, data } = JSON.parse(body) as {
          event?: string
          data?: unknown
        }
        if (typeof event === 'string' && event.length <= 64) {
          io.emit(event, data)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'event required' }))
        }
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid json' }))
      }
    })
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'not found' }))
})

control.listen(CONTROL_PORT, '127.0.0.1', () => {
  console.log(`[nightride-realtime] control REST listening on 127.0.0.1:${CONTROL_PORT}`)
})

process.on('SIGTERM', () => {
  io.close()
  control.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  io.close()
  control.close(() => process.exit(0))
})
