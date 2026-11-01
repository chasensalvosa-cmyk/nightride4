// NIGHTRIDE — authentication (local deployment mode).
// scrypt password hashing + HMAC-signed opaque session tokens stored in the
// `sessions` table and carried in an httpOnly cookie. In a Supabase
// deployment this layer is replaced by Supabase Auth (see supabase/README.md).

import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>

export const SESSION_COOKIE = 'nightride_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000 // renew once < 15 d remain

// ---------------------------------------------------------------- passwords

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, 64)
  return `${salt}:${derived.toString('hex')}`
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const derived = await scrypt(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  if (expected.length !== derived.length) return false
  return timingSafeEqual(derived, expected)
}

// ---------------------------------------------------------------- sessions

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await db.session.create({
    data: {
      token,
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  })
  return token
}

export async function destroySession(token: string): Promise<void> {
  await db.session.deleteMany({ where: { token } })
}

export interface CurrentUser {
  id: string
  username: string
  avatarUrl: string | null
  createdAt: Date
}

/** Resolve the signed-in user from the request cookies (null when signed out). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  })
  if (!session) return null
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined)
    return null
  }
  return session.user
}

/** Raw session token from the request cookies (for renewal in /api/auth/me). */
export async function readSessionToken(): Promise<string | null> {
  const store = await cookies()
  return store.get(SESSION_COOKIE)?.value ?? null
}

/** Sliding renewal: once less than 15 d remain, push the session out to a
 *  fresh 30 d so active riders stay signed in instead of being logged out
 *  “again and again”. Returns the new expiry (null = no change needed). */
export async function renewSessionIfNeeded(token: string): Promise<Date | null> {
  const session = await db.session.findUnique({ where: { token } })
  if (!session) return null
  const remaining = session.expiresAt.getTime() - Date.now()
  if (remaining > RENEW_THRESHOLD_MS) return null
  if (remaining <= 0) return null // expired — getCurrentUser already deletes it
  const extended = new Date(Date.now() + SESSION_TTL_MS)
  await db.session.update({ where: { id: session.id }, data: { expiresAt: extended } })
  return extended
}

function isHttpsRequest(req: Request): boolean {
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  if (proto) return proto === 'https'
  try {
    return new URL(req.url).protocol === 'https:'
  } catch {
    return false
  }
}

export function sessionCookieOptions(
  maxAgeSeconds: number = SESSION_TTL_MS / 1000,
  req?: Request,
): {
  httpOnly: true
  sameSite: 'lax' | 'none'
  secure: boolean
  path: string
  maxAge: number
} {
  // Over HTTPS (preview embeds, production) the cookie must be
  // SameSite=None; Secure — otherwise browsers drop it inside cross-site
  // iframes and the rider gets signed out on every reload. Over plain HTTP
  // (local dev) Lax applies, which is the safer default.
  const secure = req ? isHttpsRequest(req) : process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    sameSite: secure ? 'none' : 'lax',
    secure,
    path: '/',
    maxAge: maxAgeSeconds,
  }
}

// ---------------------------------------------------------------- validation helpers

export function validateUsername(username: string): string | null {
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return 'Username must be 3–20 characters (letters, numbers, underscore).'
  }
  return null
}

export function validatePassword(password: string): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters.'
  }
  return null
}
