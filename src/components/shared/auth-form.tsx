'use client'

// NIGHTRIDE — shared auth form.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Bike, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/dashboard'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') {
        await login(username.trim(), password)
      } else {
        await register(username.trim(), password)
      }
      router.push(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-panel">
            <Bike className="h-6 w-6 text-foreground" aria-hidden />
          </span>
          <div className="text-center">
            <h1 className="text-sm font-semibold tracking-[0.18em] text-foreground">NIGHTRIDE</h1>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-text-muted">
              E-Moto Intelligence
            </p>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-lg border border-border bg-panel p-6"
          aria-label={mode === 'login' ? 'Sign in' : 'Create account'}
        >
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {mode === 'login' ? 'Welcome back' : 'Create your rider account'}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              {mode === 'login'
                ? 'Sign in to track rides, report road conditions and save locations.'
                : 'One username and password. Your rides and locations stay private.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-xs">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z0-9_]+"
              className="border-border bg-panel-2 text-xs"
              placeholder="nightrider"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'register' ? 8 : 1}
              className="border-border bg-panel-2 text-xs"
              placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
            />
          </div>

          {error && (
            <p className="rounded-md border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-[11px] leading-relaxed text-status-danger" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>

          <p className="text-center text-[11px] text-text-muted">
            {mode === 'login' ? (
              <>
                New here?{' '}
                <Link href="/auth/register" className="text-text-secondary underline-offset-2 hover:text-foreground hover:underline">
                  Create an account
                </Link>
              </>
            ) : (
              <>
                Already riding with us?{' '}
                <Link href="/auth/login" className="text-text-secondary underline-offset-2 hover:text-foreground hover:underline">
                  Sign in
                </Link>
              </>
            )}
          </p>
        </form>

        <p className="mt-4 text-center text-[10px] leading-relaxed text-text-muted">
          <Link href="/dashboard" className="underline-offset-2 hover:underline">
            Continue without an account
          </Link>{' '}
          · browsing stays free, actions need an account.
        </p>
      </div>
    </div>
  )
}
