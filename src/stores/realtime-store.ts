// NIGHTRIDE — realtime state store (connection state + consent-gated rider
// presence). Updated by the RealtimeProvider; consumed by the sidebar
// indicator and the map's Rider Locations layer.

import { create } from 'zustand'
import type { RiderPresence } from '@/types'

interface RealtimeState {
  connected: boolean
  riders: RiderPresence[]
  /** whether THIS client is currently sharing presence (explicit consent) */
  sharingPresence: boolean
  setConnected: (connected: boolean) => void
  setRiders: (riders: RiderPresence[]) => void
  setSharingPresence: (sharing: boolean) => void
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  connected: false,
  riders: [],
  sharingPresence: false,
  setConnected: (connected) => set({ connected }),
  setRiders: (riders) => set({ riders }),
  setSharingPresence: (sharingPresence) => set({ sharingPresence }),
}))
