// NIGHTRIDE — hardened HTTP helper for third-party APIs.
// Every external request goes through here: timeouts, one retry with
// backoff for idempotent GETs, and typed error classes so API routes can
// map failures to honest "unavailable / rate_limited" states.

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export class RateLimitError extends Error {
  constructor(message = 'Provider rate limit reached') {
    super(message)
    this.name = 'RateLimitError'
  }
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Request timed out after ${ms}ms`)
    this.name = 'TimeoutError'
  }
}

interface FetchOptions {
  timeoutMs?: number
  headers?: Record<string, string>
  retries?: number
  retryDelayMs?: number
  method?: 'GET' | 'POST'
  body?: string
}

export async function fetchJson<T>(
  url: string,
  opts: FetchOptions = {},
): Promise<T> {
  const {
    timeoutMs = 8000,
    headers = {},
    retries = 1,
    retryDelayMs = 600,
    method = 'GET',
    body,
  } = opts

  let lastError: Error = new Error('Request failed')
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        headers,
        signal: controller.signal,
        method,
        body,
      })
      clearTimeout(timer)
      if (res.status === 429) throw new RateLimitError()
      if (!res.ok) {
        throw new HttpError(
          `Provider responded ${res.status}`,
          res.status,
        )
      }
      return (await res.json()) as T
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof RateLimitError) throw err
      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new TimeoutError(timeoutMs)
      } else if (err instanceof Error) {
        lastError = err
      } else {
        lastError = new Error(String(err))
      }
      // Only retry network-level failures and 5xx (never 4xx).
      const isRetryable =
        !(lastError instanceof HttpError) || lastError.status >= 500
      if (attempt < retries && isRetryable) {
        await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)))
        continue
      }
      throw lastError
    }
  }
  throw lastError
}
