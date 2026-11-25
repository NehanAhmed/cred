import { apiCall, type ApiResult } from "@/lib/api-client"

export type HealthData = {
  status: "ok"
}

export function fetchHealth(): Promise<ApiResult<HealthData>> {
  return apiCall<HealthData>("/api/health")
}
