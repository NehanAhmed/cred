"use client"

import { useAuthState } from "@/hooks/use-auth-state"
import { useApiCall } from "@/hooks/use-api-call"
import { OAUTH_ROUTES } from "@/lib/api/oauth"
import type { UserData } from "@/lib/api/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EndpointSection } from "@/components/endpoint-section"
import { ResponseViewer } from "@/components/response-viewer"
import { toast } from "sonner"

const PROVIDERS = [
  { id: "google" as const, label: "Google" },
  { id: "github" as const, label: "GitHub" },
] as const

export function OAuthSection() {
  const { user, isAuthenticated, isLoading, checkAuth } = useAuthState()
  const verifyCall = useApiCall<UserData>()

  const handleInitOAuth = (provider: "google" | "github") => {
    window.open(OAUTH_ROUTES[provider], "_blank", "noopener,noreferrer")
    toast.info(
      `Opened ${provider === "google" ? "Google" : "GitHub"} OAuth in a new tab`
    )
  }

  const handleCheckAuth = async () => {
    const res = await verifyCall.execute(() => checkAuth())
    if (res?.kind === "success") {
      toast.success("OAuth authentication confirmed!")
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm">Authentication Status</CardTitle>
          {isLoading ? (
            <Badge variant="outline">Checking...</Badge>
          ) : isAuthenticated ? (
            <Badge variant="default">Authenticated</Badge>
          ) : (
            <Badge variant="secondary">Not Authenticated</Badge>
          )}
        </CardHeader>
        <CardContent>
          {isAuthenticated && user && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Username: </span>
                <span>{user.username}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Email: </span>
                <span>{user.email}</span>
              </div>
              <div>
                <span className="text-muted-foreground">User ID: </span>
                <code className="text-xs text-muted-foreground">
                  {user._id}
                </code>
              </div>
            </div>
          )}
          {!isAuthenticated && !isLoading && (
            <p className="text-sm text-muted-foreground">
              You are not authenticated via OAuth. Click a provider button below
              to start.
            </p>
          )}
        </CardContent>
      </Card>

      <EndpointSection
        title="OAuth Initiation"
        description="Click a provider to start the OAuth 2.0 Authorization Code flow. This opens a new tab with the provider's consent screen."
      >
        <div className="flex flex-wrap gap-3">
          {PROVIDERS.map(({ id, label }) => (
            <Button
              key={id}
              onClick={() => handleInitOAuth(id)}
              variant="outline"
              className="min-w-40"
            >
              Sign in with {label}
            </Button>
          ))}
        </div>

        <Card className="bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">
              How the OAuth Flow Works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            <ol className="ml-4 list-decimal space-y-1">
              <li>
                Click a provider button &mdash; opens a new tab with the
                provider&apos;s consent screen
              </li>
              <li>
                Sign in and authorize the application on the provider&apos;s
                site
              </li>
              <li>You will be redirected back to the callback page</li>
              <li>
                The callback page verifies your auth state and displays the
                result
              </li>
              <li>
                Return to this page and click &quot;Check Auth Status&quot; to
                confirm
              </li>
            </ol>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleCheckAuth}
            disabled={verifyCall.isPending}
            variant="outline"
          >
            {verifyCall.isPending ? "Checking..." : "Check Auth Status"}
          </Button>
        </div>
      </EndpointSection>

      <ResponseViewer
        result={verifyCall.result}
        isPending={verifyCall.isPending}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Expected Cookies</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant="outline">oauth_state</Badge>
            <span className="text-muted-foreground">
              Set during initiation, cleared after callback
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">token</Badge>
            <span className="text-muted-foreground">
              JWT access token (set on successful callback)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">refreshToken</Badge>
            <span className="text-muted-foreground">
              JWT refresh token (set on successful callback)
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Note: These are httpOnly cookies and cannot be inspected from
            JavaScript. Use the &quot;Check Auth Status&quot; button to verify
            they are working.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
