"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { ChevronLeftIcon } from "lucide-react"
import { getProfile } from "@/lib/api/profile"
import type { UserData } from "@/lib/api/auth"
import type { ApiResult } from "@/lib/api-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ResponseViewer } from "@/components/response-viewer"

const OAUTH_ERROR_MAP: Record<string, string> = {
  oauth_state_mismatch:
    "State parameter mismatch. This may indicate a CSRF attack or an expired OAuth session.",
  google_auth_failed:
    "Google authentication was denied or failed. The user may have cancelled the authorization.",
  github_auth_failed:
    "GitHub authentication was denied or failed. The user may have cancelled the authorization.",
}

type OAuthState =
  | { status: "processing" }
  | {
      status: "success"
      user: UserData
      apiResult: ApiResult<UserData>
    }
  | {
      status: "error"
      error: string
      message: string
      apiResult?: ApiResult<UserData>
    }

function OAuthCallbackInner() {
  const searchParams = useSearchParams()
  const [state, setState] = useState<OAuthState>(() => {
    const errorParam = searchParams.get("error")
    if (errorParam) {
      return {
        status: "error",
        error: errorParam,
        message: OAUTH_ERROR_MAP[errorParam] ?? errorParam,
      }
    }
    return { status: "processing" }
  })

  useEffect(() => {
    if (state.status !== "processing") return

    let cancelled = false

    getProfile().then((result) => {
      if (cancelled) return

      if (result.kind === "success") {
        setState({
          status: "success",
          user: result.body.data,
          apiResult: result,
        })
      } else if (result.kind === "api-error") {
        setState({
          status: "error",
          error: "api_error",
          message: result.body.message,
          apiResult: result,
        })
      } else {
        setState({
          status: "error",
          error: "authentication_failed",
          message: "Authentication failed. Please try again.",
          apiResult: result,
        })
      }
    })

    return () => {
      cancelled = true
    }
  }, [state.status])

  const allParams = Object.fromEntries(searchParams.entries())

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div>
        <Link
          href="/oauth"
          className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" />
          Back to OAuth Testing
        </Link>
        <h1 className="text-2xl font-medium tracking-tight">OAuth Callback</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Processing the OAuth redirect from the provider
        </p>
      </div>

      {Object.keys(allParams).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Redirect Query Parameters</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-32 overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed">
              {JSON.stringify(allParams, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Authentication Result</CardTitle>
        </CardHeader>
        <CardContent>
          {state.status === "processing" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              Verifying authentication...
            </div>
          )}

          {state.status === "success" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="default">Authenticated</Badge>
                <span className="text-sm text-muted-foreground">
                  OAuth login successful
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Username: </span>
                  <span>{state.user.username}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Email: </span>
                  <span>{state.user.email}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Verified: </span>
                  <Badge
                    variant={state.user.isVerified ? "default" : "secondary"}
                  >
                    {state.user.isVerified ? "Yes" : "No"}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">User ID: </span>
                  <code className="text-xs text-muted-foreground">
                    {state.user._id}
                  </code>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/oauth">Return to OAuth Testing</Link>
              </Button>
            </div>
          )}

          {state.status === "error" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="destructive">Authentication Failed</Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  {state.error}
                </span>
              </div>
              <p className="text-sm text-destructive">{state.message}</p>
              <Button variant="outline" size="sm" asChild>
                <Link href="/oauth">Return to OAuth Testing</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {state.status !== "processing" &&
        "apiResult" in state &&
        state.apiResult && <ResponseViewer result={state.apiResult} />}
    </div>
  )
}

export const dynamic = "force-dynamic"

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">
              OAuth Callback
            </h1>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Authentication Result</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                Loading...
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <OAuthCallbackInner />
    </Suspense>
  )
}
