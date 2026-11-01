import { redirect } from 'next/navigation'

// Sandbox entry route: land directly on the dashboard.
export default function Home() {
  redirect('/dashboard')
}
