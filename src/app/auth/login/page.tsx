import { Suspense } from 'react'
import type { Metadata } from 'next'
import { AuthForm } from '@/components/shared/auth-form'

export const metadata: Metadata = { title: 'Sign in' }

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm mode="login" />
    </Suspense>
  )
}
