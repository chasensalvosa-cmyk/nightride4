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

export function sessionCookieOptions(maxAgeSeconds: number = SESSION_TTL_MS / 1000) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
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
