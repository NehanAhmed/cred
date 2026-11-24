"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EndpointSection } from "@/components/endpoint-section"
import { ResponseViewer } from "@/components/response-viewer"
import { useApiCall } from "@/hooks/use-api-call"
import { fetchHealth, type HealthData } from "@/lib/api/health"

export function HealthCheck() {
  const { result, isPending, execute } = useApiCall<HealthData>()

  const isHealthy =
    result?.kind === "success" && result.body.data.status === "ok"

  return (
    <EndpointSection
      title="Health Check"
      description="Verify the Cred API is reachable and responding."
      method="GET"
      path="/api/health"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => execute(fetchHealth)} disabled={isPending}>
          {isPending ? "Checking..." : "Check Health"}
        </Button>
        {isHealthy && (
          <Badge className="gap-1.5 bg-green-600 text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Healthy
          </Badge>
        )}
        {result?.kind === "api-error" && (
          <Badge className="gap-1.5 bg-red-600 text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Unavailable
          </Badge>
        )}
      </div>

      <ResponseViewer result={result} isPending={isPending} />
    </EndpointSection>
  )
}
