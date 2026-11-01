// NIGHTRIDE — community service (client module).

import { api } from '@/lib/api-client'
import type { CommunityReport, ReportComment } from '@/types'

export interface ReportFilters {
  categories?: string[]
  status?: 'open' | 'resolved' | 'closed'
  lat?: number
  lng?: number
  radius?: number
  sort?: 'recent' | 'nearby'
  limit?: number
}

export function fetchReports(filters: ReportFilters = {}): Promise<{ reports: CommunityReport[] }> {
  const params = new URLSearchParams()
  if (filters.categories?.length) params.set('category', filters.categories.join(','))
  if (filters.status) params.set('status', filters.status)
  if (filters.lat !== undefined && Number.isFinite(filters.lat)) {
    params.set('lat', String(filters.lat))
    params.set('lng', String(filters.lng))
  }
  if (filters.radius !== undefined) params.set('radius', String(filters.radius))
  if (filters.sort) params.set('sort', filters.sort)
  if (filters.limit) params.set('limit', String(filters.limit))
  const qs = params.toString()
  return api.get(`/api/community/reports${qs ? `?${qs}` : ''}`)
}

export function fetchReport(id: string): Promise<{ report: CommunityReport }> {
  return api.get(`/api/community/reports/${id}`)
}

export function createReport(body: {
  title: string
  description: string
  category: CommunityReport['category']
  latitude: number
  longitude: number
  locationLabel?: string
}): Promise<{ report: CommunityReport }> {
  return api.post('/api/community/reports', body)
}

export function updateReportStatus(
  id: string,
  status: 'open' | 'resolved' | 'closed',
): Promise<{ report: CommunityReport }> {
  return api.patch(`/api/community/reports/${id}`, { status })
}

export function deleteReport(id: string): Promise<{ ok: boolean }> {
  return api.del(`/api/community/reports/${id}`)
}

export function fetchComments(reportId: string): Promise<{ comments: ReportComment[] }> {
  return api.get(`/api/community/reports/${reportId}/comments`)
}

export function addComment(
  reportId: string,
  content: string,
): Promise<{ comment: ReportComment }> {
  return api.post(`/api/community/reports/${reportId}/comments`, { content })
}

export function confirmReport(reportId: string): Promise<{ confirmed: boolean; confirmationCount: number }> {
  return api.post(`/api/community/reports/${reportId}/confirmations`)
}

export function unconfirmReport(reportId: string): Promise<{ confirmed: boolean; confirmationCount: number }> {
  return api.del(`/api/community/reports/${reportId}/confirmations`)
}

export function flagAbuse(
  itemType: 'report' | 'comment',
  itemId: string,
  reason: string,
): Promise<{ ok: boolean }> {
  return api.post('/api/community/flags', { itemType, itemId, reason })
}
