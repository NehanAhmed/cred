"use client"

import { useState } from "react"
import type { UserData } from "@/lib/api/auth"
import { useAuthState } from "@/hooks/use-auth-state"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EndpointSection } from "@/components/endpoint-section"
import { ResponseViewer } from "@/components/response-viewer"
import { ArrowRightIcon } from "lucide-react"
import type { ApiResult } from "@/lib/api-client"

function RequestFlowDiagram() {
  const steps = [
    {
      label: "User Input",
      value: "Form fields & buttons",
      color: "border-primary bg-primary/5 dark:bg-primary/10",
    },
    {
      label: "Testing App UI",
      value: "React component state",
      color: "border-border bg-muted",
    },
    {
      label: "Construct Request",
      value: "apiCall(path, { method, body })",
      color: "border-border bg-muted",
    },
    {
      label: "Send to cred-kit API",
      value: "fetch() with credentials: include",
      color: "border-border bg-muted",
    },
    {
      label: "Receive Response",
      value: "HTTP response with headers",
      color: "border-border bg-muted",
    },
    {
      label: "Parse Response",
      value: "response.json() or text()",
      color: "border-border bg-muted",
    },
    {
      label: "Classify Result",
      value:
        "classifyResponse(): success / api-error / validation-error / rate-limit / redirect / network-error",
      color: "border-foreground/20 bg-card",
    },
    {
      label: "Display Result",
      value: "ResponseViewer component",
      color: "border-border bg-muted",
    },
  ]

  return (
    <div className="space-y-6">
      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Pipeline Overview</CardTitle>
          <CardDescription className="text-xs">
            Every API request follows this exact pipeline through the system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-4">
            {steps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div
                  className={`rounded-md border-2 px-3 py-2 text-xs font-medium ${step.color}`}
                >
                  <div className="text-[10px] text-muted-foreground">
                    {idx + 1}
                  </div>
                  <div>{step.label}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {step.value}
                  </div>
                </div>
                {idx < steps.length - 1 && (
                  <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Data Flow Trace (Live)</CardTitle>
          <CardDescription className="text-xs">
            Click a response in any module to see the request flow pipeline
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-xs text-muted-foreground">
            <p>
              Each{" "}
              <code className="rounded bg-muted px-1 font-mono">
                ResponseViewer
              </code>{" "}
              card provides a collapsible <strong>Request Flow</strong> section.
              Click the card header to expand it and trace the pipeline steps
              for that specific API call.
            </p>
            <div className="rounded-md border border-border bg-card p-3">
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1">
                  <div className="size-2 rounded-full bg-blue-500" />
                  <span>Construct</span>
                </div>
                <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex items-center gap-1">
                  <div className="size-2 rounded-full bg-primary" />
                  <span>Send</span>
                </div>
                <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex items-center gap-1">
                  <div className="size-2 rounded-full bg-primary" />
                  <span>Receive</span>
                </div>
                <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex items-center gap-1">
                  <div className="size-2 rounded-full bg-primary" />
                  <span>Parse</span>
                </div>
                <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex items-center gap-1">
                  <div className="size-2 rounded-full bg-foreground" />
                  <span>Classify</span>
                </div>
                <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex items-center gap-1">
                  <div className="size-2 rounded-full bg-foreground" />
                  <span>Display</span>
                </div>
              </div>
            </div>
            <p>
              The trace shows the raw request method, HTTP status, body content,
              classification path, and the final result kind — all derived from
              the live API response.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Flow Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <Badge variant="outline" className="mt-0.5 shrink-0 text-[10px]">
              F1
            </Badge>
            <span>
              The{" "}
              <code className="rounded bg-muted px-1 font-mono">apiCall</code>{" "}
              function in{" "}
              <code className="rounded bg-muted px-1 font-mono">
                lib/api-client.ts
              </code>{" "}
              implements steps 3-7. It constructs the request, sends it via
              <code className="rounded bg-muted px-1 font-mono"> fetch</code>,
              parses the response, and classifies it into the
              <code className="rounded bg-muted px-1 font-mono">
                ApiResult
              </code>{" "}
              discriminated union.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Badge variant="outline" className="mt-0.5 shrink-0 text-[10px]">
              F2
            </Badge>
            <span>
              The classification logic in{" "}
              <code className="rounded bg-muted px-1 font-mono">
                classifyResponse()
              </code>{" "}
              follows a strict priority: redirect (302) → network error
              (non-object) → rate-limit (429) → validation error (errors array)
              → success (body.success=true) → API error (body.success=false) →
              unclassifiable.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Badge variant="outline" className="mt-0.5 shrink-0 text-[10px]">
              F3
            </Badge>
            <span>
              The{" "}
              <code className="rounded bg-muted px-1 font-mono">
                useApiCall
              </code>{" "}
              hook wraps the flow at the component level, managing{" "}
              <code className="rounded bg-muted px-1 font-mono">isPending</code>{" "}
              and{" "}
              <code className="rounded bg-muted px-1 font-mono">result</code>{" "}
              states, enabling components to trigger calls and display results.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

type AuthStateProps = {
  user: UserData | null
  isAuthenticated: boolean
  isLoading: boolean
}

function AuthStateMachine({
  isAuthenticated,
  user,
  isLoading,
}: AuthStateProps) {
  const currentState: string = isLoading
    ? "checking"
    : !isAuthenticated
      ? "unauthenticated"
      : user?.isVerified
        ? "authenticated"
        : "unverified"

  const stateLabel: Record<string, string> = {
    checking: "Checking...",
    unauthenticated: "Not Authenticated",
    unverified: "Unverified",
    verified: "Verified",
    authenticated: "Authenticated",
    deleted: "Deleted",
  }

  const stateBadgeVariant: Record<
    string,
    "default" | "secondary" | "outline" | "destructive"
  > = {
    checking: "outline",
    unauthenticated: "secondary",
    unverified: "outline",
    verified: "default",
    authenticated: "default",
    deleted: "destructive",
  }

  const states = [
    {
      id: "unauthenticated",
      label: "Unauthenticated",
      description: "No active session",
      color: "border-muted-foreground/30",
      badgeVariant: "secondary",
    },
    {
      id: "unverified",
      label: "Registered, Unverified",
      description: "Account created, email pending",
      color: "border-amber-400",
      badgeVariant: "outline",
    },
    {
      id: "verified",
      label: "Registered, Verified",
      description: "Email confirmed, ready to login",
      color: "border-primary/50",
      badgeVariant: "default",
    },
    {
      id: "authenticated",
      label: "Authenticated",
      description: "Active session with JWT cookies",
      color: "border-primary",
      badgeVariant: "default",
    },
    {
      id: "deleted",
      label: "Deleted",
      description: "Account permanently removed",
      color: "border-destructive/50",
      badgeVariant: "destructive",
    },
  ]

  const transitions = [
    {
      from: "unauthenticated",
      to: "unverified",
      action: "Register",
      method: "POST /api/auth",
    },
    {
      from: "unauthenticated",
      to: "authenticated",
      action: "OAuth Callback",
      method: "GET /api/auth/{provider}/callback",
    },
    {
      from: "unverified",
      to: "verified",
      action: "Verify Email",
      method: "GET /api/auth/verify-email/:token",
    },
    {
      from: "verified",
      to: "authenticated",
      action: "Login",
      method: "POST /api/auth/login",
    },
    {
      from: "unauthenticated",
      to: "authenticated",
      action: "Login",
      method: "POST /api/auth/login",
    },
    {
      from: "authenticated",
      to: "authenticated",
      action: "Refresh Token",
      method: "POST /api/auth/refresh",
    },
    {
      from: "authenticated",
      to: "unauthenticated",
      action: "Logout",
      method: "POST /api/auth/logout",
    },
    {
      from: "authenticated",
      to: "deleted",
      action: "Delete Account",
      method: "DELETE /api/profile/me",
    },
  ]

  const getCurrentTransition = () => {
    if (currentState === "checking") return null
    return transitions.filter(
      (t) => t.to === currentState || t.from === currentState
    )
  }

  const relevantTransitions = getCurrentTransition()

  return (
    <div className="space-y-6">
      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">State Machine</CardTitle>
            <Badge variant={stateBadgeVariant[currentState] ?? "secondary"}>
              {stateLabel[currentState] ?? currentState}
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Current auth state: <strong>{currentState}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            {states.map((s) => (
              <div
                key={s.id}
                className={`rounded-lg border-2 p-3 transition-all ${
                  s.id === currentState
                    ? `${s.color} bg-card shadow-sm ring-1 ring-primary/20`
                    : "border-muted bg-muted/30 opacity-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`size-2 shrink-0 rounded-full ${
                      s.id === currentState
                        ? "bg-primary"
                        : "bg-muted-foreground"
                    }`}
                  />
                  <span className="text-xs font-medium">{s.label}</span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Transitions</CardTitle>
          <CardDescription className="text-xs">
            Actions that move between states
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {transitions.map((t, idx) => {
              const isActive =
                relevantTransitions?.some(
                  (rt) =>
                    rt.from === t.from &&
                    rt.to === t.to &&
                    rt.action === t.action
                ) ?? false

              return (
                <div
                  key={idx}
                  className={`flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs transition-all ${
                    isActive
                      ? "border-primary/30 bg-primary/5"
                      : "border-border"
                  }`}
                >
                  <Badge
                    variant={
                      isActive
                        ? "default"
                        : currentState === t.from
                          ? "outline"
                          : "secondary"
                    }
                    className="shrink-0 text-[10px]"
                  >
                    {t.from} → {t.to}
                  </Badge>
                  <span className="font-medium">{t.action}</span>
                  <code className="ml-auto rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                    {t.method}
                  </code>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">State Diagrams</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-xs text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">Register Flow</p>
            <pre className="mt-1 rounded-md bg-muted p-2 font-mono text-xs">
              {`[Unauthenticated]
  → Register          → [Registered, Unverified]
  → Verify Email      → [Registered, Verified]
  → Login             → [Authenticated]`}
            </pre>
          </div>
          <div>
            <p className="font-medium text-foreground">Session Flow</p>
            <pre className="mt-1 rounded-md bg-muted p-2 font-mono text-xs">
              {`[Authenticated]
  → Refresh Token     → [Authenticated] (tokens rotated)
  → Logout            → [Unauthenticated]
  → Delete Account    → [Deleted]`}
            </pre>
          </div>
          <div>
            <p className="font-medium text-foreground">OAuth Flow</p>
            <pre className="mt-1 rounded-md bg-muted p-2 font-mono text-xs">
              {`[Unauthenticated]
  → OAuth Initiate    → [Redirect to Provider]
  → OAuth Callback    → [Authenticated] (on success)
  → OAuth Callback    → [Unauthenticated] (on failure)`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function CookieLifecycle({ isAuthenticated }: { isAuthenticated: boolean }) {
  const cookieActions = [
    {
      action: "Register",
      method: "POST /api/auth",
      token: null,
      refreshToken: null,
      oauthState: null,
      note: "No cookies set",
    },
    {
      action: "Login",
      method: "POST /api/auth/login",
      token: "set",
      refreshToken: "set",
      oauthState: null,
      note: "httpOnly, Secure, SameSite",
    },
    {
      action: "Refresh",
      method: "POST /api/auth/refresh",
      token: "rotate",
      refreshToken: "rotate",
      oauthState: null,
      note: "New values replace old",
    },
    {
      action: "Logout",
      method: "POST /api/auth/logout",
      token: "clear",
      refreshToken: "clear",
      oauthState: null,
      note: "Server clears cookies",
    },
    {
      action: "OAuth Init",
      method: "GET /api/auth/{provider}",
      token: null,
      refreshToken: null,
      oauthState: "set",
      note: "Short-lived state parameter",
    },
    {
      action: "OAuth Callback",
      method: "GET /api/auth/{provider}/callback",
      token: "set",
      refreshToken: "set",
      oauthState: "clear",
      note: "oauth_state consumed, JWT cookies set",
    },
    {
      action: "Delete Account",
      method: "DELETE /api/profile/me",
      token: null,
      refreshToken: null,
      oauthState: null,
      note: "Cookies remain (client must call Logout)",
    },
  ]

  return (
    <div className="space-y-6">
      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Cookie Lifecycle Table</CardTitle>
          <CardDescription className="text-xs">
            How cookies are affected by each auth action
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Action
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Endpoint
                </th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">
                  <code className="rounded bg-muted px-1 font-mono">token</code>
                  <div className="text-[10px] font-normal">(24h)</div>
                </th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">
                  <code className="rounded bg-muted px-1 font-mono">
                    refreshToken
                  </code>
                  <div className="text-[10px] font-normal">(7d, /api/auth)</div>
                </th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">
                  <code className="rounded bg-muted px-1 font-mono">
                    oauth_state
                  </code>
                  <div className="text-[10px] font-normal">(transient)</div>
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody>
              {cookieActions.map((row, idx) => (
                <tr
                  key={idx}
                  className={
                    idx < cookieActions.length - 1
                      ? "border-b border-border/50"
                      : ""
                  }
                >
                  <td className="px-3 py-2.5 font-medium">{row.action}</td>
                  <td className="px-3 py-2.5">
                    <code className="rounded bg-muted px-1 font-mono text-[10px]">
                      {row.method}
                    </code>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {row.token === "set" && (
                      <Badge variant="default" className="text-[10px]">
                        Set
                      </Badge>
                    )}
                    {row.token === "rotate" && (
                      <Badge
                        variant="outline"
                        className="border-amber-400 text-[10px] text-amber-600"
                      >
                        Rotate
                      </Badge>
                    )}
                    {row.token === "clear" && (
                      <Badge variant="destructive" className="text-[10px]">
                        Clear
                      </Badge>
                    )}
                    {row.token === null && (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {row.refreshToken === "set" && (
                      <Badge variant="default" className="text-[10px]">
                        Set
                      </Badge>
                    )}
                    {row.refreshToken === "rotate" && (
                      <Badge
                        variant="outline"
                        className="border-amber-400 text-[10px] text-amber-600"
                      >
                        Rotate
                      </Badge>
                    )}
                    {row.refreshToken === "clear" && (
                      <Badge variant="destructive" className="text-[10px]">
                        Clear
                      </Badge>
                    )}
                    {row.refreshToken === null && (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {row.oauthState === "set" && (
                      <Badge variant="default" className="text-[10px]">
                        Set
                      </Badge>
                    )}
                    {row.oauthState === "clear" && (
                      <Badge variant="destructive" className="text-[10px]">
                        Clear
                      </Badge>
                    )}
                    {row.oauthState === null && (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {row.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Cookie Properties</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <div className="rounded-md border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <Badge
                variant={isAuthenticated ? "default" : "outline"}
                className="shrink-0"
              >
                {isAuthenticated ? "Present" : "N/A"}
              </Badge>
              <div>
                <code className="rounded bg-muted px-1 font-mono text-xs">
                  token
                </code>
                <span className="ml-2 text-muted-foreground">
                  JWT access token — 24h expiry, httpOnly, Secure, SameSite
                </span>
              </div>
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <Badge
                variant={isAuthenticated ? "default" : "outline"}
                className="shrink-0"
              >
                {isAuthenticated ? "Present" : "N/A"}
              </Badge>
              <div>
                <code className="rounded bg-muted px-1 font-mono text-xs">
                  refreshToken
                </code>
                <span className="ml-2 text-muted-foreground">
                  JWT refresh token — 7d expiry, path=/api/auth, httpOnly,
                  Secure, SameSite
                </span>
              </div>
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="shrink-0">
                Transient
              </Badge>
              <div>
                <code className="rounded bg-muted px-1 font-mono text-xs">
                  oauth_state
                </code>
                <span className="ml-2 text-muted-foreground">
                  CSRF state parameter — set during OAuth initiation, cleared on
                  callback
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ResponseClassification() {
  const [selected, setSelected] = useState<ApiResult<unknown> | null>(null)
  const [isPending, setIsPending] = useState(false)

  const simulate = (factory: () => ApiResult<unknown>) => {
    setIsPending(true)
    setSelected(factory())
    setIsPending(false)
  }

  const types: {
    id: string
    label: string
    detection: string
    display: string
    badgeVariant: "default" | "secondary" | "destructive" | "outline"
    classify: () => ApiResult<unknown>
  }[] = [
    {
      id: "success",
      label: "Standard Success",
      detection: "body.success === true",
      display: "Green card with data section",
      badgeVariant: "default",
      classify: () =>
        ({
          kind: "success",
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          body: {
            success: true,
            message: "OK",
            data: {
              user: {
                _id: "507f1f77bcf86cd799439011",
                username: "johndoe",
                email: "john@example.com",
                isVerified: true,
              },
            },
          },
        }) as ApiResult<unknown>,
    },
    {
      id: "api-error",
      label: "Standard Error",
      detection: "body.success === false",
      display: "Red card with message and error",
      badgeVariant: "destructive",
      classify: () =>
        ({
          kind: "api-error",
          status: 400,
          headers: new Headers({ "content-type": "application/json" }),
          body: {
            success: false,
            message: "Invalid input",
            error: "VALIDATION_ERROR",
          },
        }) as ApiResult<unknown>,
    },
    {
      id: "validation-error",
      label: "Zod Validation Error",
      detection: "body.errors is an array of ZodIssue",
      display: "Orange card, per-issue list",
      badgeVariant: "secondary",
      classify: () =>
        ({
          kind: "validation-error",
          status: 400,
          headers: new Headers({ "content-type": "application/json" }),
          body: {
            errors: [
              {
                path: ["email"],
                message: "Invalid email address",
                code: "invalid_string",
                expected: "email",
                received: "notanemail",
              },
              {
                path: ["password"],
                message: "Password must be at least 8 characters",
                code: "too_small",
              },
            ],
          },
        }) as ApiResult<unknown>,
    },
    {
      id: "rate-limit",
      label: "Rate Limit Error",
      detection: "HTTP 429, response.message contains rate limit text",
      display: "Yellow card",
      badgeVariant: "outline",
      classify: () =>
        ({
          kind: "rate-limit",
          status: 429,
          headers: new Headers({
            "content-type": "application/json",
            "retry-after": "60",
          }),
          body: {
            message:
              "Too many authentication attempts, please try again later.",
          },
        }) as ApiResult<unknown>,
    },
    {
      id: "redirect",
      label: "Redirect",
      detection: "response.redirected === true or 302 status",
      display: "Info card showing redirect URL",
      badgeVariant: "secondary",
      classify: () =>
        ({
          kind: "redirect",
          status: 302,
          headers: new Headers({ location: "/login?verified=true" }),
          location: "/login?verified=true",
        }) as ApiResult<unknown>,
    },
    {
      id: "network-error",
      label: "Network Error",
      detection: "fetch throws (DNS failure, connection refused)",
      display: "Red card with error details",
      badgeVariant: "destructive",
      classify: () =>
        ({
          kind: "network-error",
          error: new Error("Failed to fetch: ERR_CONNECTION_REFUSED"),
        }) as ApiResult<unknown>,
    },
    {
      id: "cors",
      label: "CORS Error",
      detection: "fetch throws with CORS-specific message",
      display: "Red card with CORS badge + configuration guidance",
      badgeVariant: "destructive",
      classify: () =>
        ({
          kind: "network-error",
          error: new Error("Failed to fetch"),
          isCorsError: true,
        }) as ApiResult<unknown>,
    },
  ]

  return (
    <div className="space-y-6">
      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Response Classification Reference
          </CardTitle>
          <CardDescription className="text-xs">
            How every API response is classified and displayed (PRD §6.1)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {types.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Badge variant={t.badgeVariant} className="shrink-0">
                    {t.label}
                  </Badge>
                  <div className="text-xs text-muted-foreground">
                    <div>
                      <span className="font-medium text-foreground">
                        Detection:
                      </span>{" "}
                      <code className="rounded bg-muted px-1 font-mono">
                        {t.detection}
                      </code>
                    </div>
                    <div>
                      <span className="font-medium text-foreground">
                        Display:
                      </span>{" "}
                      {t.display}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => simulate(t.classify)}
                >
                  Simulate
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <ResponseViewer result={selected} isPending={isPending} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Classification Priority</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-muted-foreground">
          <p>
            The{" "}
            <code className="rounded bg-muted px-1 font-mono">
              classifyResponse()
            </code>{" "}
            function in{" "}
            <code className="rounded bg-muted px-1 font-mono">
              lib/api-client.ts
            </code>{" "}
            applies a strict priority chain:
          </p>
          <pre className="rounded-md bg-muted p-2 font-mono text-xs">
            {`1. Redirect          → status===302 && location
2. Network Error      → body not an object
3. Rate Limit         → status===429
4. Validation Error   → body.errors is array
5. Success            → body.success===true
6. API Error          → body.success===false
7. Unclassifiable     → network-error`}
          </pre>
          <p>
            The first matching rule wins. This ensures that edge cases (rate
            limits, network failures) are always surfaced before generic
            success/error paths.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function EdgeCasesTable() {
  const edgeCases = [
    {
      id: 1,
      name: "cred-kit API not running",
      strategy: "fetch throws → network-error card with retry button",
      location: "lib/api-client.ts:195",
      status: "covered" as const,
    },
    {
      id: 2,
      name: "CORS errors",
      strategy:
        "Detect TypeError + 'Failed to fetch' → CORS badge + configuration guidance",
      location: "lib/api-client.ts:195, components/response-viewer.tsx",
      status: "covered" as const,
    },
    {
      id: 3,
      name: "Cookie not set due to sameSite",
      strategy:
        "Post-login auth check → Session Inspector guidance about same-origin requirement",
      location: "components/profile-section.tsx:975",
      status: "covered" as const,
    },
    {
      id: 4,
      name: "Token expired mid-session",
      strategy:
        "checkAuth() detects 401 on previously active session → toast with re-login link",
      location: "hooks/use-auth-state.ts:49",
      status: "covered" as const,
    },
    {
      id: 5,
      name: "Concurrent token reuse race condition",
      strategy:
        "Documented in Refresh tab — MongoDB atomic operations handle this",
      location: "components/auth-section.tsx:568",
      status: "covered" as const,
    },
    {
      id: 6,
      name: "Empty response body",
      strategy: "Handle in api-client → show raw status code",
      location: "lib/api-client.ts:170",
      status: "covered" as const,
    },
    {
      id: 7,
      name: "Non-JSON response",
      strategy: "Detect Content-Type header → show raw text",
      location: "lib/api-client.ts:186",
      status: "covered" as const,
    },
    {
      id: 8,
      name: "OAuth popup blockers",
      strategy: "Guide user to allow popups or open in new tab manually",
      location: "components/oauth-section.tsx:23",
      status: "covered" as const,
    },
    {
      id: 9,
      name: "Ethereal not available",
      strategy:
        "Show note that Ethereal preview URL is logged to server console",
      location: "components/auth-section.tsx:267",
      status: "covered" as const,
    },
  ]

  return (
    <div className="space-y-6">
      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Edge Cases Reference</CardTitle>
          <CardDescription className="text-xs">
            Every edge case from the PRD with its handling strategy and
            implementation status (PRD §6.2)
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  #
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Edge Case
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Handling Strategy
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Location
                </th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {edgeCases.map((ec) => (
                <tr key={ec.id} className="border-b border-border/50">
                  <td className="px-3 py-2.5 text-muted-foreground">{ec.id}</td>
                  <td className="px-3 py-2.5 font-medium">{ec.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {ec.strategy}
                  </td>
                  <td className="px-3 py-2.5">
                    <code className="rounded bg-muted px-1 font-mono text-[10px]">
                      {ec.location}
                    </code>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <Badge variant="default" className="text-[10px]">
                      Covered
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

export function DataFlowSection() {
  const authState = useAuthState()

  return (
    <Tabs defaultValue="request-flow">
      <TabsList>
        <TabsTrigger value="request-flow">5.1 — Request Flow</TabsTrigger>
        <TabsTrigger value="state-machine">
          5.2 — Auth State Machine
        </TabsTrigger>
        <TabsTrigger value="cookie-lifecycle">
          5.3 — Cookie Lifecycle
        </TabsTrigger>
        <TabsTrigger value="classification">
          6.1 — Response Classification
        </TabsTrigger>
        <TabsTrigger value="edge-cases">6.2 — Edge Cases</TabsTrigger>
      </TabsList>
      <TabsContent value="request-flow" className="mt-6">
        <EndpointSection
          title="Standard API Request Flow"
          description="The complete pipeline from user interaction to displayed result (PRD §5.1)"
        >
          <RequestFlowDiagram />
        </EndpointSection>
      </TabsContent>
      <TabsContent value="state-machine" className="mt-6">
        <EndpointSection
          title="Authentication State Machine"
          description="All auth states and the transitions between them (PRD §5.2)"
        >
          <AuthStateMachine
            user={authState.user}
            isAuthenticated={authState.isAuthenticated}
            isLoading={authState.isLoading}
          />
        </EndpointSection>
      </TabsContent>
      <TabsContent value="cookie-lifecycle" className="mt-6">
        <EndpointSection
          title="Cookie Lifecycle"
          description="How cookies are set, refreshed, and cleared throughout the auth lifecycle (PRD §5.3)"
        >
          <CookieLifecycle isAuthenticated={authState.isAuthenticated} />
        </EndpointSection>
      </TabsContent>
      <TabsContent value="classification" className="mt-6">
        <EndpointSection
          title="Response Classification"
          description="How every API response is classified into the ApiResult discriminated union (PRD §6.1)"
        >
          <ResponseClassification />
        </EndpointSection>
      </TabsContent>
      <TabsContent value="edge-cases" className="mt-6">
        <EndpointSection
          title="Edge Cases"
          description="All edge cases with their handling strategies and implementation status (PRD §6.2)"
        >
          <EdgeCasesTable />
        </EndpointSection>
      </TabsContent>
    </Tabs>
  )
}
