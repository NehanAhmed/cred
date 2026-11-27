"use client"

import type { ApiResult } from "@/lib/api-client"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type ResponseViewerProps<T> = {
  result: ApiResult<T> | null
  isPending?: boolean
}

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return "bg-green-500"
  if (status === 429) return "bg-yellow-500"
  if (status >= 400 && status < 500) return "bg-orange-500"
  if (status >= 500) return "bg-red-500"
  return "bg-gray-500"
}

function resultBadge(kind: string): {
  label: string
  variant: "default" | "secondary" | "destructive" | "outline"
} {
  switch (kind) {
    case "success":
      return { label: "Success", variant: "default" }
    case "api-error":
      return { label: "API Error", variant: "destructive" }
    case "validation-error":
      return { label: "Validation Error", variant: "secondary" }
    case "rate-limit":
      return { label: "Rate Limited", variant: "outline" }
    case "redirect":
      return { label: "Redirect", variant: "secondary" }
    case "network-error":
      return { label: "Network Error", variant: "destructive" }
    default:
      return { label: kind, variant: "outline" }
  }
}

function ResultHeader({ result }: { result: ApiResult<unknown> }) {
  const badge = resultBadge(result.kind)

  return (
    <div className="flex items-center gap-3">
      <Badge variant={badge.variant}>{badge.label}</Badge>
      {"status" in result && (
        <Badge className={`${statusColor(result.status)} text-white`}>
          {result.status}
        </Badge>
      )}
    </div>
  )
}

function JsonBlock({ data }: { data: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed">
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}

export function ResponseViewer<T>({
  result,
  isPending,
}: ResponseViewerProps<T>) {
  if (isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Response</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            Waiting for response...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!result) {
    return null
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm">Response</CardTitle>
        <ResultHeader result={result} />
      </CardHeader>
      <CardContent className="space-y-4">
        {"headers" in result && (
          <div>
            <h4 className="mb-1 text-xs font-medium text-muted-foreground">
              Headers
            </h4>
            <JsonBlock
              data={Object.fromEntries(
                Array.from(result.headers.entries()).filter(
                  ([key]) => !key.startsWith("x-")
                )
              )}
            />
          </div>
        )}

        {"body" in result && (
          <div>
            <h4 className="mb-1 text-xs font-medium text-muted-foreground">
              Body
            </h4>
            <JsonBlock data={result.body} />
          </div>
        )}

        {"location" in result && (
          <div>
            <h4 className="mb-1 text-xs font-medium text-muted-foreground">
              Location
            </h4>
            <code className="rounded bg-muted px-2 py-1 text-xs break-all">
              {result.location}
            </code>
          </div>
        )}

        {"error" in result && result.kind === "network-error" && (
          <div>
            <h4 className="mb-1 text-xs font-medium text-destructive">
              {result.isCorsError ? "CORS Error" : "Error"}
            </h4>
            <p className="text-sm text-destructive">{result.error.message}</p>
            {result.isCorsError && (
              <p className="mt-1 text-xs text-muted-foreground">
                CORS error detected. Ensure the cred-kit backend includes this
                origin in its{" "}
                <code className="rounded bg-muted px-1">CORS_ORIGIN</code>{" "}
                environment variable, or use the API proxy (already set up in{" "}
                <code className="rounded bg-muted px-1">proxy.ts</code>).
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
