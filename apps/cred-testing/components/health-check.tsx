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
      description="Verify the cred-kit API is reachable and responding."
      method="GET"
      path="/api/health"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => execute(fetchHealth)} disabled={isPending}>
          {isPending ? "Checking..." : "Check Health"}
        </Button>
        {isHealthy && (
          <Badge variant="default" className="gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Healthy
          </Badge>
        )}
        {result?.kind === "api-error" && (
          <Badge variant="destructive" className="gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Unavailable
          </Badge>
        )}
      </div>

      <ResponseViewer result={result} isPending={isPending} />
    </EndpointSection>
  )
}
