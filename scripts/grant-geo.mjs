// Grant geolocation permission to the agent-browser Chrome instance via CDP,
// then re-run the geolocation-dependent map flows.
const CDP = process.argv[2]
if (!CDP) {
  console.error('usage: node grant-geo.mjs <cdp-url>')
  process.exit(1)
}
const ws = new WebSocket(CDP)
let nextId = 1
const pending = new Map()
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`timeout waiting for ${method}`))
      }
    }, 8000)
  })
}
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(JSON.stringify(msg.error)))
    else resolve(msg.result)
  }
}
ws.onerror = (e) => { console.error('ws error', e); process.exit(1) }
ws.onopen = async () => {
  try {
    await send('Browser.grantPermissions', { permissions: ['geolocation'] })
    console.log('granted geolocation')
    ws.close()
    process.exit(0)
  } catch (e) {
    console.error('grant failed:', e.message)
    process.exit(1)
  }
}
