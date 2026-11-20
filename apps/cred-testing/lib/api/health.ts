import { apiCall, type ApiResult } from "@/lib/api-client"

export type HealthData = {
  name: string
  version: string
  environment: string
  uptime: number
  memory: {
    rss: number
    heapTotal: number
    heapUsed: number
  }
  nodeVersion: string
  platform: string
  database: {
    status: "connected" | "disconnected" | "slow"
    latency: number | null
  }
  timestamp: string
}

export function fetchHealth(): Promise<ApiResult<HealthData>> {
  return apiCall<HealthData>("/api/health")
}
