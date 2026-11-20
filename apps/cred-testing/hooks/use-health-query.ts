"use client"

import { useQuery } from "@tanstack/react-query"
import { fetchHealth, type HealthData } from "@/lib/api/health"
import type { ApiResult } from "@/lib/api-client"

export function useHealthQuery() {
  return useQuery<ApiResult<HealthData>>({
    queryKey: ["health"],
    queryFn: fetchHealth,
  })
}
