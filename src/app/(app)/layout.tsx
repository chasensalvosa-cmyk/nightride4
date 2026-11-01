import type { Metadata } from 'next'
import { AppShell } from '@/components/layout/app-shell'

export const metadata: Metadata = {
  title: {
    default: 'NIGHTRIDE — E-Moto Intelligence',
    template: '%s · NIGHTRIDE',
  },
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
