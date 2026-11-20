"use client"

import { useQuery } from "@tanstack/react-query"
import { getAuditLogs } from "@/lib/api/audit"
import type { ApiResult } from "@/lib/api-client"
import type { AuditLogData } from "@/lib/api/audit"

export function useAuditLogs(page: number = 1, limit: number = 20) {
  return useQuery<ApiResult<AuditLogData>>({
    queryKey: ["audit-logs", page, limit],
    queryFn: () => getAuditLogs(page, limit),
  })
}
