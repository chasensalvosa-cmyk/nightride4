// NIGHTRIDE — server-side realtime broadcaster.
// API routes publish domain events to the Socket.IO mini-service control
// API (mini-services/realtime-service, port 3004) so clients receive pushes
// instead of polling. Fire-and-forget with timeout: a down service must
// never fail the primary write.

const SERVICE_URL =
  process.env.REALTIME_SERVICE_URL?.trim() || 'http://127.0.0.1:3004'

export async function broadcast(event: string, data: unknown): Promise<void> {
  try {
    await fetch(`${SERVICE_URL}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, data }),
      signal: AbortSignal.timeout(2500),
    })
  } catch {
    // Realtime is best-effort; persistence already succeeded.
  }
}

export async function pingRealtimeService(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    })
    return res.ok
  } catch {
    return false
  }
}
