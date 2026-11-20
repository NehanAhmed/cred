import { apiCall, type ApiResult } from "@/lib/api-client"

export type AuditLogEntry = {
  _id: string
  user: string
  action: string
  status: string
  ip: string
  userAgent: string
  metadata: Record<string, unknown>
  createdAt: string
}

export type AuditLogData = {
  logs: AuditLogEntry[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export function getAuditLogs(
  page = 1,
  limit = 20
): Promise<ApiResult<AuditLogData>> {
  return apiCall<AuditLogData>(
    `/api/profile/me/audit-logs?page=${page}&limit=${limit}`
  )
}
