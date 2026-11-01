'use client'

// NIGHTRIDE — realtime hook (Socket.IO through the sandbox gateway).
// Shared singleton socket; pages subscribe to pushed events instead of polling.

import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type {
  CommunityReport,
  PublicSafetyEvent,
  ReportComment,
  RiderPresence,
} from '@/types'

let socket: Socket | null = null
let refCount = 0

function getSocket(): Socket {
  if (!socket) {
    // NEVER put the port in the URL: the gateway routes via XTransformPort.
    socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1500,
      timeout: 8000,
    })
  }
  return socket
}

export interface RealtimeHandlers {
  onReportNew?: (report: CommunityReport) => void
  onReportUpdated?: (data: {
    id: string
    status: string
    verificationStatus: string
    updatedAt: string
  }) => void
  onCommentNew?: (data: { reportId: string; comment: ReportComment }) => void
  onSafetyNew?: (event: PublicSafetyEvent) => void
  onPresence?: (riders: RiderPresence[]) => void
}

export function useRealtime(handlers: RealtimeHandlers = {}) {
  const [connected, setConnected] = useState(false)
  const handlersRef = useRef(handlers)

  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  useEffect(() => {
    const s = getSocket()
    refCount += 1

    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    const onReportNew = (data: CommunityReport) => handlersRef.current.onReportNew?.(data)
    const onReportUpdated = (data: Parameters<NonNullable<RealtimeHandlers['onReportUpdated']>>[0]) =>
      handlersRef.current.onReportUpdated?.(data)
    const onCommentNew = (data: Parameters<NonNullable<RealtimeHandlers['onCommentNew']>>[0]) =>
      handlersRef.current.onCommentNew?.(data)
    const onSafetyNew = (data: PublicSafetyEvent) => handlersRef.current.onSafetyNew?.(data)
    const onPresence = (data: RiderPresence[]) => handlersRef.current.onPresence?.(data)

    s.on('connect', onConnect)
    s.on('disconnect', onDisconnect)
    s.on('report:new', onReportNew)
    s.on('report:updated', onReportUpdated)
    s.on('comment:new', onCommentNew)
    s.on('safety:new', onSafetyNew)
    s.on('presence:update', onPresence)
    // initial state (deferred: no synchronous setState in the effect body)
    const initial = setTimeout(() => setConnected(s.connected), 0)

    return () => {
      refCount -= 1
      clearTimeout(initial)
      s.off('connect', onConnect)
      s.off('disconnect', onDisconnect)
      s.off('report:new', onReportNew)
      s.off('report:updated', onReportUpdated)
      s.off('comment:new', onCommentNew)
      s.off('safety:new', onSafetyNew)
      s.off('presence:update', onPresence)
      if (refCount <= 0 && socket) {
        socket.disconnect()
        socket = null
        refCount = 0
      }
    }
  }, [])

  /** Explicit-consent presence sharing (Rider Locations layer). */
  const sharePresence = (payload: {
    userId: string
    username: string
    lat: number
    lng: number
    heading?: number | null
    speedKmh?: number | null
  }) => {
    getSocket().emit('presence:share', payload)
  }

  const stopPresence = () => {
    getSocket().emit('presence:stop')
  }

  return { connected, sharePresence, stopPresence }
}
