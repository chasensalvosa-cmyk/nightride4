import type { Metadata } from 'next'
import MapClient from '@/components/map/MapClient'

export const metadata: Metadata = {
  title: 'Live Map',
}

export default function MapPage() {
  return <MapClient />
}
