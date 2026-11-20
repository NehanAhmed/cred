"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useApiCall } from "@/hooks/use-api-call"
import { fetchHealth, type HealthData } from "@/lib/api/health"
import { EndpointSection } from "@/components/endpoint-section"
import { ResponseViewer } from "@/components/response-viewer"

function DatabaseBadge({
  status,
  latency,
}: {
  status: HealthData["database"]["status"]
  latency: number | null
}) {
  const colorMap: Record<string, string> = {
    connected: "bg-green-600 text-white",
    slow: "bg-yellow-500 text-black",
    disconnected: "bg-red-600 text-white",
  }

  const labelMap: Record<string, string> = {
    connected: "Connected",
    slow: "Slow",
    disconnected: "Disconnected",
  }

  return (
    <Badge
      className={`${colorMap[status] ?? "bg-gray-500 text-white"} gap-1.5`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      Database: {labelMap[status] ?? status}
      {latency !== null && ` (${latency}ms)`}
    </Badge>
  )
}

function HealthMetrics({ data }: { data: HealthData }) {
  const uptime = data.uptime
  const days = Math.floor(uptime / 86400)
  const hours = Math.floor((uptime % 86400) / 3600)
  const minutes = Math.floor((uptime % 3600) / 60)
  const uptimeStr = `${days}d ${hours}h ${minutes}m`

  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      {[
        ["Name", data.name],
        ["Version", data.version],
        ["Environment", data.environment],
        ["Uptime", uptimeStr],
        ["Node Version", data.nodeVersion],
        ["Platform", data.platform],
        ["Timestamp", new Date(data.timestamp).toLocaleString()],
      ].map(([label, value]) => (
        <div key={label} className="space-y-0.5">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-mono text-xs font-medium">{value}</p>
        </div>
      ))}
      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground">Memory (RSS)</p>
        <p className="font-mono text-xs font-medium">
          {(data.memory.rss / 1024 / 1024).toFixed(1)} MB
        </p>
      </div>
      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground">Memory (Heap)</p>
        <p className="font-mono text-xs font-medium">
          {data.memory.heapUsed.toLocaleString()} /{" "}
          {data.memory.heapTotal.toLocaleString()} bytes
        </p>
      </div>
    </div>
  )
}

export function HealthCheck() {
  const { result, isPending, execute } = useApiCall<HealthData>()

  return (
    <EndpointSection
      title="Health Check"
      description="Verify the Cred API is reachable and the database connection is healthy."
      method="GET"
      path="/api/health"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => execute(fetchHealth)} disabled={isPending}>
          {isPending ? "Checking..." : "Check Health"}
        </Button>
        {result?.kind === "success" && (
          <DatabaseBadge
            status={result.body.data.database.status}
            latency={result.body.data.database.latency}
          />
        )}
      </div>

      {result?.kind === "success" && <HealthMetrics data={result.body.data} />}

      <ResponseViewer result={result} isPending={isPending} />
    </EndpointSection>
  )
}
