"use client"

import { useState, useEffect } from "react"
import { RATE_LIMITER_DEFS } from "@/lib/api/rate-limit"
import type { RateLimiterDef } from "@/lib/api/rate-limit"
import { useRateLimitTest } from "@/hooks/use-rate-limit-test"
import type {
  SingleRequestResult,
  RateLimitSummary,
} from "@/hooks/use-rate-limit-test"
import { useAuthState } from "@/hooks/use-auth-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { EndpointSection } from "@/components/endpoint-section"

function ResultSummaryBadge({ summary }: { summary: RateLimitSummary }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <Badge variant="default">{summary.succeeded} succeeded</Badge>
      <Badge
        variant={summary.rateLimited > 0 ? "outline" : "secondary"}
        className={
          summary.rateLimited > 0 ? "border-yellow-500 text-yellow-600" : ""
        }
      >
        {summary.rateLimited} rate-limited
      </Badge>
      {summary.other > 0 && (
        <Badge variant="secondary">{summary.other} other</Badge>
      )}
    </div>
  )
}

function ResultList({
  results,
  firstRateLimited,
}: {
  results: SingleRequestResult[]
  firstRateLimited?: SingleRequestResult
}) {
  const showResults = results.slice(-10).reverse()

  return (
    <div className="space-y-2">
      {results.length > 10 && (
        <p className="text-xs text-muted-foreground">
          Showing the last 10 of {results.length} requests
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {showResults.map((r) => (
          <Badge
            key={r.index}
            variant={
              r.kind === "success"
                ? "default"
                : r.kind === "rate-limit"
                  ? "outline"
                  : "secondary"
            }
            className={
              r.kind === "rate-limit"
                ? "border-yellow-500 text-yellow-600"
                : r.kind === "network-error"
                  ? "border-red-500 text-red-600"
                  : ""
            }
            title={`#${r.index}: HTTP ${r.status} (${r.kind})`}
          >
            #{r.index} {r.status}
          </Badge>
        ))}
      </div>
      {firstRateLimited && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-yellow-600">
              First Rate-Limited Response (Request #{firstRateLimited.index})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-32 overflow-auto rounded bg-muted/50 p-2 font-mono text-xs">
              {JSON.stringify(firstRateLimited.body, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ResetTimer({
  firstRateLimitedAt,
  retryAfter,
  window,
}: {
  firstRateLimitedAt: number | null
  retryAfter: number | null
  window: string
}) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!firstRateLimitedAt) return

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - firstRateLimitedAt) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [firstRateLimitedAt])

  if (!firstRateLimitedAt) return null

  const resetSeconds = retryAfter ?? 60
  const remaining = Math.max(0, resetSeconds - elapsed)

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
      <span className="text-yellow-600">
        {remaining > 0 ? (
          <>
            Rate limited — retry in ~{remaining}s
            {!retryAfter && (
              <span className="text-muted-foreground"> (window: {window})</span>
            )}
          </>
        ) : (
          "Rate limit window should have reset — try again"
        )}
      </span>
    </div>
  )
}

function RateLimiterCard({ def }: { def: RateLimiterDef }) {
  const { isAuthenticated } = useAuthState()
  const {
    results,
    isRunning,
    summary,
    firstRateLimited,
    firstRateLimitedAt,
    retryAfter,
    fire,
    reset,
  } = useRateLimitTest(def)

  const needsAuth = def.requiresAuth
  const authOk = !needsAuth || isAuthenticated
  const disabled = isRunning || !authOk

  const handleFire = () => {
    fire(requestCount)
  }

  const handleAbort = () => {
    reset()
  }

  const [requestCount, setRequestCount] = useState(15)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm">{def.name}</CardTitle>
              {needsAuth && (
                <Badge
                  variant={isAuthenticated ? "default" : "outline"}
                  className="text-[10px]"
                >
                  {isAuthenticated ? "Auth" : "Auth required"}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{def.description}</p>
          </div>
          <div className="shrink-0 space-y-0.5 text-right font-mono text-xs">
            <span
              className={
                def.method === "GET"
                  ? "text-green-500"
                  : def.method === "POST"
                    ? "text-blue-500"
                    : "text-orange-500"
              }
            >
              {def.method}
            </span>
            <span className="ml-1.5 text-muted-foreground">{def.endpoint}</span>
            <div className="text-muted-foreground">
              {def.maxRequests} / {def.window}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor={`n-${def.id}`} className="text-xs">
              N:
            </Label>
            <Input
              id={`n-${def.id}`}
              type="number"
              min={1}
              max={50}
              value={requestCount}
              onChange={(e) =>
                setRequestCount(
                  Math.max(1, Math.min(50, Number(e.target.value) || 1))
                )
              }
              disabled={isRunning}
              className="h-8 w-16 text-xs"
            />
          </div>
          <Button
            size="sm"
            onClick={handleFire}
            disabled={disabled || requestCount < 1}
          >
            {isRunning ? "Firing..." : "Rapid Fire"}
          </Button>
          {isRunning && (
            <Button size="sm" variant="outline" onClick={handleAbort}>
              Abort
            </Button>
          )}
          {!isRunning && results.length > 0 && (
            <Button size="sm" variant="ghost" onClick={handleAbort}>
              Clear
            </Button>
          )}
          {!authOk && (
            <span className="text-xs text-muted-foreground">Log in first</span>
          )}
        </div>

        {isRunning && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            Firing requests... {results.length} / {requestCount}
          </div>
        )}

        {results.length > 0 && (
          <>
            <ResultSummaryBadge summary={summary} />
            <ResultList results={results} firstRateLimited={firstRateLimited} />
            <ResetTimer
              firstRateLimitedAt={firstRateLimitedAt}
              retryAfter={retryAfter}
              window={def.window}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function RateLimitSection() {
  const authOptional = RATE_LIMITER_DEFS.filter((d) => !d.requiresAuth)
  const authRequired = RATE_LIMITER_DEFS.filter((d) => d.requiresAuth)
  const { isAuthenticated } = useAuthState()

  return (
    <div className="space-y-8">
      <EndpointSection
        title="Rate Limiting Test Harness"
        description="Observe rate limiter behavior for each endpoint by firing rapid successions of requests."
      >
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Each card represents a rate limiter. Set N (number of requests) and
            click <strong>Rapid Fire</strong> to send requests in quick
            succession. The test tracks how many succeed vs. are rate-limited
            (HTTP 429).
          </p>
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-yellow-600">
                Rate Limit Response Format
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              <p>
                Rate limit responses use a non-standard format:{" "}
                <code className="rounded bg-muted px-1 font-mono">
                  {`{"message": "Too many authentication attempts, please try again later."}`}
                </code>
                . They do not follow the standard{" "}
                <code className="rounded bg-muted px-1 font-mono">
                  ApiResponse
                </code>{" "}
                envelope.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">
                Important Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              <ul className="list-disc pl-4">
                <li>
                  Endpoints marked{" "}
                  <Badge variant="outline" className="text-[10px]">
                    Auth required
                  </Badge>{" "}
                  will fail with HTTP 401 if you are not logged in.
                </li>
                <li>
                  Login (Global) and Login (Specific) share the same endpoint.
                  The login-specific limiter (5/15min) will likely trigger
                  before the global one (20/15min).
                </li>
                <li>
                  Register creates accounts with random usernames/emails.
                  Duplicate-user errors (400) may appear alongside rate-limit
                  responses.
                </li>
                <li>
                  OAuth endpoint will return a redirect, not a JSON response.
                </li>
                <li>
                  Verify Email and Reset Password use dummy tokens &mdash; they
                  validate the token format and may return 400 for invalid
                  tokens before hitting the rate limit.
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </EndpointSection>

      <div className="space-y-4">
        <h2 className="text-lg font-medium tracking-tight">
          No Authentication Required
        </h2>
        <div className="grid gap-4">
          {authOptional.map((def) => (
            <RateLimiterCard key={def.id} def={def} />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium tracking-tight">
            Authentication Required
          </h2>
          {!isAuthenticated && (
            <Badge variant="outline" className="text-xs">
              Log in to unlock
            </Badge>
          )}
        </div>
        <div className="grid gap-4">
          {authRequired.map((def) => (
            <RateLimiterCard key={def.id} def={def} />
          ))}
        </div>
      </div>
    </div>
  )
}
