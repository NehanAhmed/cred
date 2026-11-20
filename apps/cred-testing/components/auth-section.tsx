"use client"

import { useState, useMemo } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useAuthState } from "@/hooks/use-auth-state"
import { useApiCall } from "@/hooks/use-api-call"
import {
  register as registerApi,
  login as loginApi,
  logout as logoutApi,
  refreshToken as refreshApi,
  verifyEmail as verifyEmailApi,
  forgotPassword as forgotPasswordApi,
  resetPassword as resetPasswordApi,
} from "@/lib/api/auth"
import { getProfile } from "@/lib/api/profile"
import {
  registerSchema,
  loginSchema,
  passwordForgotSchema,
} from "@/lib/schemas/auth"
import { passwordSchema } from "@/lib/schemas/common"
import type { ApiResult } from "@/lib/api-client"
import type {
  RegisterInput,
  LoginInput,
  LoginData,
  UserData,
} from "@/lib/api/auth"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form"
import { EndpointSection } from "@/components/endpoint-section"
import { ResponseViewer } from "@/components/response-viewer"
import { toast } from "sonner"

function AuthStatusBar({
  user,
  isAuthenticated,
  isLoading,
}: {
  user: UserData | null
  isAuthenticated: boolean
  isLoading: boolean
}) {
  return (
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
              <span className="text-muted-foreground">Verified: </span>
              <Badge variant={user.isVerified ? "default" : "secondary"}>
                {user.isVerified ? "Yes" : "No"}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">User ID: </span>
              <code className="text-xs text-muted-foreground">{user._id}</code>
            </div>
          </div>
        )}
        {!isAuthenticated && !isLoading && (
          <p className="text-sm text-muted-foreground">
            You are not logged in. Use the Login or Register tabs below.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function RegisterTab() {
  const registerCall = useApiCall<Record<string, never>>()
  const [genderValue, setGenderValue] = useState<string>("")
  const [registerAttemptsLeft, setRegisterAttemptsLeft] = useState(3)
  const [registerRateLimitUntil, setRegisterRateLimitUntil] = useState<
    number | null
  >(null)

  const form = useForm<RegisterInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(registerSchema as any) as any,
    defaultValues: {
      username: "",
      email: "",
      password: "",
      bio: "",
      phoneNumber: "",
    },
  })

  const onSubmit = form.handleSubmit(async (data) => {
    const payload: RegisterInput = {
      username: data.username,
      email: data.email,
      password: data.password,
    }
    if (data.bio) payload.bio = data.bio
    if (data.phoneNumber) payload.phoneNumber = data.phoneNumber
    if (data.gender) payload.gender = data.gender

    const res = await registerCall.execute(() => registerApi(payload))
    setRegisterAttemptsLeft((prev) => Math.max(0, prev - 1))
    if (res?.kind === "rate-limit") {
      const ms = new Date().getTime()
      setRegisterRateLimitUntil(ms + 60 * 60 * 1000)
    }
    if (res?.kind === "success") {
      toast.success("Registration successful!")
    }
  })

  return (
    <EndpointSection
      title="Register"
      description="Create a new user account. Rate limit: 3 per 60 minutes."
      method="POST"
      path="/api/auth"
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username *</FormLabel>
                  <FormControl>
                    <Input placeholder="johndoe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="john@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password *</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Min 8 chars, 1 uppercase, 1 digit"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bio</FormLabel>
                  <FormControl>
                    <Input placeholder="About me..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input placeholder="+1234567890" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gender</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value)
                      setGenderValue(value)
                    }}
                    value={genderValue}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={registerCall.isPending || registerAttemptsLeft === 0}
            >
              {registerCall.isPending ? "Registering..." : "Register"}
            </Button>
            {registerAttemptsLeft < 3 && (
              <Badge
                variant={registerAttemptsLeft === 0 ? "outline" : "secondary"}
              >
                Register: {registerAttemptsLeft}/3 remaining
              </Badge>
            )}
            {registerRateLimitUntil !== null && (
              <span className="text-xs text-yellow-600">
                Rate limited — window resets after 60 min
              </span>
            )}
            <p className="text-xs text-muted-foreground">
              After registering, check the server console for the Ethereal email
              preview URL. Then switch to the <strong>Verify Email</strong> tab
              to paste the verification link.
            </p>
          </div>
        </form>
      </Form>
      <ResponseViewer
        result={registerCall.result}
        isPending={registerCall.isPending}
      />
    </EndpointSection>
  )
}

function LoginTab() {
  const loginCall = useApiCall<LoginData>()
  const verifyCall = useApiCall<UserData>()
  const { isAuthenticated, checkAuth } = useAuthState()
  const [loginMode, setLoginMode] = useState<"email" | "username">("email")
  const [loginAttemptsLeft, setLoginAttemptsLeft] = useState(5)
  const [loginRateLimitUntil, setLoginRateLimitUntil] = useState<number | null>(
    null
  )

  const form = useForm<LoginInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(loginSchema as any) as any,
    defaultValues: {
      email: "",
      username: "",
      password: "",
    },
  })

  const toggleMode = () => {
    const next = loginMode === "email" ? "username" : "email"
    if (next === "email") {
      form.setValue("username", "")
    } else {
      form.setValue("email", "")
    }
    form.clearErrors()
    setLoginMode(next)
  }

  const onSubmit = form.handleSubmit(async (data) => {
    const payload: LoginInput = {
      password: data.password,
    }
    if (loginMode === "email") {
      payload.email = data.email
    } else {
      payload.username = data.username
    }
    const res = await loginCall.execute(() => loginApi(payload))
    setLoginAttemptsLeft((prev) => Math.max(0, prev - 1))
    if (res?.kind === "rate-limit") {
      const ms = new Date().getTime()
      setLoginRateLimitUntil(ms + 15 * 60 * 1000)
    }
    if (res?.kind === "success") {
      toast.success("Login successful!")
      await checkAuth()
    }
  })

  const handleVerifyAuth = async () => {
    await verifyCall.execute(() => checkAuth())
  }

  return (
    <EndpointSection
      title="Login"
      description="Authenticate with email or username. Rate limit: 5 per 15 minutes."
      method="POST"
      path="/api/auth/login"
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Login with:</span>
            <Button
              type="button"
              variant={loginMode === "email" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                if (loginMode !== "email") toggleMode()
              }}
            >
              Email
            </Button>
            <Button
              type="button"
              variant={loginMode === "username" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                if (loginMode !== "username") toggleMode()
              }}
            >
              Username
            </Button>
            {loginAttemptsLeft < 5 && (
              <Badge
                variant={loginAttemptsLeft === 0 ? "outline" : "secondary"}
              >
                Login: {loginAttemptsLeft}/5 remaining
              </Badge>
            )}
            {loginRateLimitUntil !== null && (
              <span className="text-xs text-yellow-600">
                Rate limited — window resets after 15 min
              </span>
            )}
          </div>
          {loginMode === "email" && (
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="john@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {loginMode === "username" && (
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username *</FormLabel>
                  <FormControl>
                    <Input placeholder="johndoe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password *</FormLabel>
                <FormControl>
                  <Input type="password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={loginCall.isPending}>
              {loginCall.isPending ? "Logging in..." : "Login"}
            </Button>
            {isAuthenticated && (
              <Button
                type="button"
                variant="outline"
                onClick={handleVerifyAuth}
                disabled={verifyCall.isPending}
              >
                {verifyCall.isPending ? "Verifying..." : "Verify Auth"}
              </Button>
            )}
          </div>
        </form>
      </Form>
      <ResponseViewer
        result={loginCall.result}
        isPending={loginCall.isPending}
      />
      <ResponseViewer
        result={verifyCall.result}
        isPending={verifyCall.isPending}
      />
    </EndpointSection>
  )
}

function LogoutTab() {
  const logoutCall = useApiCall<null>()
  const verifyCall = useApiCall<UserData>()
  const { isAuthenticated, user, clearAuth, checkAuth } = useAuthState()

  const handleLogout = async () => {
    const res = await logoutCall.execute(() => logoutApi())
    if (res?.kind === "success") {
      toast.success("Logged out successfully")
      clearAuth()
    }
  }

  const handleVerifyPostLogout = async () => {
    const res = await verifyCall.execute(() => checkAuth())
    if (res?.kind === "api-error" || res?.kind === "network-error") {
      toast.success("Auth state: logged out (confirmed)")
    }
  }

  return (
    <EndpointSection
      title="Logout"
      description="End the current session. Rate limit: 20 per 15 minutes."
      method="POST"
      path="/api/auth/logout"
    >
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Current Auth State</CardTitle>
          </CardHeader>
          <CardContent>
            {isAuthenticated && user ? (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="default">Logged In</Badge>
                <span>{user.username}</span>
                <span className="text-muted-foreground">({user.email})</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="secondary">Not Logged In</Badge>
              </div>
            )}
          </CardContent>
        </Card>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleLogout}
            disabled={logoutCall.isPending}
            variant="destructive"
          >
            {logoutCall.isPending ? "Logging out..." : "Logout"}
          </Button>
          {!isAuthenticated && (
            <Button
              type="button"
              variant="outline"
              onClick={handleVerifyPostLogout}
              disabled={verifyCall.isPending}
            >
              {verifyCall.isPending ? "Verifying..." : "Verify Post-Logout"}
            </Button>
          )}
        </div>
      </div>
      <ResponseViewer
        result={logoutCall.result}
        isPending={logoutCall.isPending}
      />
      <ResponseViewer
        result={verifyCall.result}
        isPending={verifyCall.isPending}
      />
    </EndpointSection>
  )
}

function RefreshTab() {
  const refreshCall = useApiCall<null>()
  const verifyCall = useApiCall<UserData>()
  const { isAuthenticated, checkAuth } = useAuthState()
  const [rotationResult, setRotationResult] = useState<{
    step1: ApiResult<null> | null
    step2: ApiResult<null> | null
  }>({ step1: null, step2: null })
  const [isTestingRotation, setIsTestingRotation] = useState(false)

  const handleRefresh = async () => {
    const res = await refreshCall.execute(() => refreshApi())
    if (res?.kind === "success") {
      toast.success("Token refreshed!")
      await checkAuth()
    }
  }

  const handleVerifyAuth = async () => {
    await verifyCall.execute(() => checkAuth())
  }

  const handleRotationTest = async () => {
    setIsTestingRotation(true)
    setRotationResult({ step1: null, step2: null })

    const step1 = await refreshApi()
    setRotationResult({ step1, step2: null })

    if (step1.kind === "success") {
      const step2 = await refreshApi()
      setRotationResult({ step1, step2 })
      if (step2.kind === "success") {
        toast.success("Rotation confirmed — new tokens are valid")
      }
    }

    setIsTestingRotation(false)
  }

  return (
    <EndpointSection
      title="Refresh Token"
      description="Rotate the access and refresh tokens. Rate limit: 10 per 15 minutes."
      method="POST"
      path="/api/auth/refresh"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <Badge variant="default">Authenticated</Badge>
          ) : (
            <Badge variant="secondary">Not Authenticated</Badge>
          )}
          <span className="text-sm text-muted-foreground">
            {isAuthenticated
              ? "You have an active session. Refresh to rotate tokens."
              : "Log in first before refreshing tokens."}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleRefresh}
            disabled={refreshCall.isPending || !isAuthenticated}
          >
            {refreshCall.isPending ? "Refreshing..." : "Refresh Token"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleVerifyAuth}
            disabled={verifyCall.isPending}
          >
            {verifyCall.isPending ? "Verifying..." : "Verify Auth"}
          </Button>
          {isAuthenticated && (
            <Button
              type="button"
              variant="outline"
              onClick={handleRotationTest}
              disabled={isTestingRotation}
            >
              {isTestingRotation ? "Testing..." : "Test Rotation"}
            </Button>
          )}
        </div>
        {rotationResult.step1 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Rotation Test Results
            </p>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Step 1 (first refresh &mdash; rotates tokens):
              </p>
              <ResponseViewer result={rotationResult.step1} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Step 2 (second refresh &mdash; verifies new tokens work):
              </p>
              <ResponseViewer result={rotationResult.step2} />
            </div>
          </div>
        )}
        <Card className="bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">
              Token Reuse Test
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <p>To test token reuse detection:</p>
            <ol className="mt-1 ml-4 list-decimal space-y-1">
              <li>Login to establish a session</li>
              <li>Click Refresh to rotate the token family</li>
              <li>
                The old refresh token is now invalid &mdash; any attempt to use
                it will return HTTP 401 with &quot;Refresh token reuse detected.
                All sessions revoked.&quot;
              </li>
            </ol>
            <p className="mt-1">
              httpOnly cookies cannot be read from JavaScript. Use the{" "}
              <strong>Test Rotation</strong> button above to verify new tokens
              work after rotation. For full reuse testing with old cookies, use
              curl or Postman.
            </p>
            <pre className="mt-2 rounded bg-muted p-2 font-mono text-xs">
              {`# Login first, then copy the refreshToken cookie value
curl -X POST http://localhost:3000/api/auth/refresh \\
  -H "Cookie: refreshToken=OLD_TOKEN_VALUE"`}
            </pre>
          </CardContent>
        </Card>
      </div>
      <ResponseViewer
        result={refreshCall.result}
        isPending={refreshCall.isPending}
      />
      <ResponseViewer
        result={verifyCall.result}
        isPending={verifyCall.isPending}
      />
    </EndpointSection>
  )
}

function VerifyEmailTab() {
  const verifyCall = useApiCall<never>()
  const loginCheckCall = useApiCall<LoginData>()
  const profileCheckCall = useApiCall<UserData>()
  const [tokenInput, setTokenInput] = useState("")
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")

  const extractedToken = useMemo(() => {
    const trimmed = tokenInput.trim()
    const match = trimmed.match(/\/verify-email\/([^/?]+)/)
    if (match) return match[1]
    return trimmed
  }, [tokenInput])

  const verifiedParam = useMemo(() => {
    if (verifyCall.result?.kind !== "redirect") return null
    try {
      const url = new URL(verifyCall.result.location)
      return url.searchParams.get("verified")
    } catch {
      return null
    }
  }, [verifyCall.result])

  const handleVerify = () => {
    if (!extractedToken) return
    verifyCall.execute(() => verifyEmailApi(extractedToken))
  }

  const { checkAuth } = useAuthState()

  const handleLoginCheck = async () => {
    const loginRes = await loginCheckCall.execute(() =>
      loginApi({ email: loginEmail, password: loginPassword })
    )
    if (loginRes?.kind === "success") {
      await checkAuth()
      await profileCheckCall.execute(() => getProfile())
    }
  }

  const handleOpenRedirect = () => {
    if (verifyCall.result?.kind === "redirect" && verifyCall.result.location) {
      const a = document.createElement("a")
      a.href = verifyCall.result.location
      a.target = "_blank"
      a.rel = "noopener noreferrer"
      a.click()
    }
  }

  const isVerifying = verifyCall.isPending
  const canVerify = extractedToken.length > 0 && !isVerifying

  return (
    <EndpointSection
      title="Verify Email"
      description="Test the email verification flow — validate tokens, check expiry, and confirm account verification."
      method="GET"
      path="/api/auth/verify-email/:token"
    >
      <div className="space-y-4">
        <Card className="bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">
              How it works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            <ol className="ml-4 list-decimal space-y-1">
              <li>
                Register a new account using the <strong>Register</strong> tab
              </li>
              <li>
                Check the server console for the Ethereal preview URL and open
                it
              </li>
              <li>
                Copy the verification link from the email and paste it below
              </li>
            </ol>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <Label htmlFor="verify-token">Verification Token or URL</Label>
          <Input
            id="verify-token"
            placeholder="Paste the full verification URL or just the token..."
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
          />
          {extractedToken && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Extracted token:</span>
              <Badge variant="secondary" className="font-mono text-xs">
                {extractedToken.length > 40
                  ? extractedToken.slice(0, 40) + "..."
                  : extractedToken}
              </Badge>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleVerify} disabled={!canVerify}>
            {isVerifying ? "Verifying..." : "Verify Email"}
          </Button>
          {verifyCall.result?.kind === "redirect" && (
            <Button variant="outline" onClick={handleOpenRedirect}>
              Open in Browser
            </Button>
          )}
        </div>
      </div>

      <ResponseViewer
        result={verifyCall.result}
        isPending={verifyCall.isPending}
      />

      {verifiedParam !== null && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Verification Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Email verified:
              </span>
              <Badge
                variant={verifiedParam === "true" ? "default" : "secondary"}
              >
                {verifiedParam === "true" ? "Yes" : "No"}
              </Badge>
              {verifiedParam === "false" && (
                <span className="text-xs text-muted-foreground">
                  The token may be invalid or expired. Try registering again.
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Post-Verification Login Test
          </CardTitle>
          <CardDescription className="text-xs">
            After successful verification, try logging in to confirm
            <code className="mx-1 rounded bg-muted px-1">isVerified</code>is now{" "}
            <code className="rounded bg-muted px-1">true</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="john@example.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                placeholder="Enter password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>
          </div>
          <Button
            onClick={handleLoginCheck}
            disabled={loginCheckCall.isPending || !loginEmail || !loginPassword}
          >
            {loginCheckCall.isPending
              ? "Logging in..."
              : "Login & Check Verification"}
          </Button>
          <ResponseViewer
            result={loginCheckCall.result}
            isPending={loginCheckCall.isPending}
          />
          {loginCheckCall.result?.kind === "success" && (
            <ResponseViewer
              result={profileCheckCall.result}
              isPending={profileCheckCall.isPending}
            />
          )}
        </CardContent>
      </Card>
    </EndpointSection>
  )
}

function PasswordResetTab() {
  const forgotCall = useApiCall<null>()
  const resetCall = useApiCall<null>()
  const verifyNewCall = useApiCall<LoginData>()
  const verifyOldCall = useApiCall<LoginData>()
  const { checkAuth } = useAuthState()

  const [tokenInput, setTokenInput] = useState("")
  const [passwordReset, setPasswordReset] = useState(false)
  const [verificationOldPassword, setVerificationOldPassword] = useState("")
  const [forgotAttemptsLeft, setForgotAttemptsLeft] = useState(3)
  const [forgotRateLimitUntil, setForgotRateLimitUntil] = useState<
    number | null
  >(null)

  const forgotForm = useForm<z.infer<typeof passwordForgotSchema>>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(passwordForgotSchema as any) as any,
    defaultValues: { email: "" },
  })

  const passwordResetFormSchema = useMemo(
    () =>
      z
        .object({
          password: passwordSchema,
          confirmPassword: z.string().min(1, "Please confirm your password"),
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: "Passwords do not match",
          path: ["confirmPassword"],
        }),
    []
  )

  type PasswordResetFormValues = z.infer<typeof passwordResetFormSchema>

  const resetForm = useForm<PasswordResetFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(passwordResetFormSchema as any) as any,
    defaultValues: { password: "", confirmPassword: "" },
  })

  const extractedToken = useMemo(() => {
    const trimmed = tokenInput.trim()
    const match = trimmed.match(/\/reset-password\/([^/?]+)/)
    if (match) return match[1]
    return trimmed
  }, [tokenInput])

  const forgotEmail = useWatch({ control: forgotForm.control, name: "email" })
  const newPassword = useWatch({ control: resetForm.control, name: "password" })

  const onForgotSubmit = forgotForm.handleSubmit(async (data) => {
    const res = await forgotCall.execute(() => forgotPasswordApi(data.email))
    setForgotAttemptsLeft((prev) => Math.max(0, prev - 1))
    if (res?.kind === "rate-limit") {
      const ms = new Date().getTime()
      setForgotRateLimitUntil(ms + 60 * 60 * 1000)
    }
    if (res?.kind === "success") {
      toast.success("Reset email sent!")
    }
  })

  const handleReset = resetForm.handleSubmit(async (data) => {
    if (!extractedToken) {
      toast.error("Please enter a reset token")
      return
    }
    const res = await resetCall.execute(() =>
      resetPasswordApi(extractedToken, data.password)
    )
    if (res?.kind === "success") {
      toast.success("Password reset successfully!")
      setPasswordReset(true)
      setVerificationOldPassword("")
    }
  })

  const handleVerifyNew = async () => {
    if (!forgotEmail) {
      toast.error("Enter an email in the Forgot Password form first")
      return
    }
    if (!newPassword) {
      toast.error("Set a new password in the Reset Password form first")
      return
    }
    const res = await verifyNewCall.execute(() =>
      loginApi({ email: forgotEmail, password: newPassword })
    )
    if (res?.kind === "success") {
      await checkAuth()
    }
  }

  const handleVerifyOld = async () => {
    if (!forgotEmail || !verificationOldPassword) {
      toast.error("Enter the old password to test")
      return
    }
    const res = await verifyOldCall.execute(() =>
      loginApi({ email: forgotEmail, password: verificationOldPassword })
    )
    if (res?.kind === "success") {
      toast.success("Old password correctly rejected")
    }
  }

  const canReset = extractedToken.length > 0 && !resetCall.isPending

  return (
    <div className="space-y-6">
      <EndpointSection
        title="Forgot Password"
        description="Request a password reset email. Rate limit: 3 per 60 minutes."
        method="POST"
        path="/api/auth/forgot-password"
      >
        <p className="text-xs text-muted-foreground">
          The API returns the same message whether the email exists or not
          (prevents enumeration).
        </p>
        <Form {...forgotForm}>
          <form onSubmit={onForgotSubmit} className="space-y-4">
            <FormField
              control={forgotForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="john@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                disabled={forgotCall.isPending || forgotAttemptsLeft === 0}
              >
                {forgotCall.isPending ? "Sending..." : "Send Reset Email"}
              </Button>
              {forgotAttemptsLeft < 3 && (
                <Badge
                  variant={forgotAttemptsLeft === 0 ? "outline" : "secondary"}
                >
                  Reset requests: {forgotAttemptsLeft}/3 remaining
                </Badge>
              )}
              {forgotRateLimitUntil !== null && (
                <span className="text-xs text-yellow-600">
                  Rate limited — window resets after 60 min
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              After requesting, check the server console for the Ethereal
              preview URL containing the reset link. Then paste the token below.
            </p>
          </form>
        </Form>
        <ResponseViewer
          result={forgotCall.result}
          isPending={forgotCall.isPending}
        />
      </EndpointSection>

      <EndpointSection
        title="Reset Password"
        description="Reset your password using the token from the reset email."
        method="POST"
        path="/api/auth/reset-password/:token"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-token">Reset Token or URL</Label>
            <Input
              id="reset-token"
              placeholder="Paste the full reset URL or just the token..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
            />
            {extractedToken && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Extracted token:</span>
                <Badge variant="secondary" className="font-mono text-xs">
                  {extractedToken.length > 40
                    ? extractedToken.slice(0, 40) + "..."
                    : extractedToken}
                </Badge>
              </div>
            )}
          </div>

          <Form {...resetForm}>
            <form onSubmit={handleReset} className="space-y-4">
              <FormField
                control={resetForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Min 8 chars, 1 uppercase, 1 digit"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={resetForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Re-enter your new password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={!canReset}>
                {resetCall.isPending ? "Resetting..." : "Reset Password"}
              </Button>
            </form>
          </Form>
        </div>
        <ResponseViewer
          result={resetCall.result}
          isPending={resetCall.isPending}
        />
      </EndpointSection>

      {passwordReset && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Post-Reset Verification</CardTitle>
            <CardDescription className="text-xs">
              Verify the new password works and the old password is rejected.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={forgotEmail}
                  readOnly
                  className="bg-muted/50 text-sm"
                />
              </div>
              <Button
                size="sm"
                onClick={handleVerifyNew}
                disabled={verifyNewCall.isPending}
              >
                {verifyNewCall.isPending
                  ? "Verifying..."
                  : "Verify New Password Works"}
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label>Old Password</Label>
                <Input
                  type="password"
                  placeholder="Enter old password to test rejection"
                  value={verificationOldPassword}
                  onChange={(e) => setVerificationOldPassword(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleVerifyOld}
                disabled={verifyOldCall.isPending || !verificationOldPassword}
              >
                {verifyOldCall.isPending
                  ? "Verifying..."
                  : "Verify Old Password Fails"}
              </Button>
            </div>
            <Card className="bg-muted/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">
                  Token Usage
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                <p>
                  Reset tokens are one-time use. Attempting to reuse the same
                  token will return HTTP 400 with &quot;Invalid or expired
                  token.&quot;
                </p>
              </CardContent>
            </Card>
          </CardContent>
          <ResponseViewer
            result={verifyNewCall.result}
            isPending={verifyNewCall.isPending}
          />
          <ResponseViewer
            result={verifyOldCall.result}
            isPending={verifyOldCall.isPending}
          />
        </Card>
      )}
    </div>
  )
}
export function AuthSection() {
  const { user, isAuthenticated, isLoading } = useAuthState()

  return (
    <div className="space-y-6">
      <AuthStatusBar
        user={user}
        isAuthenticated={isAuthenticated}
        isLoading={isLoading}
      />
      <Tabs defaultValue="register">
        <TabsList>
          <TabsTrigger value="register">Register</TabsTrigger>
          <TabsTrigger value="login">Login</TabsTrigger>
          <TabsTrigger value="logout">Logout</TabsTrigger>
          <TabsTrigger value="refresh">Refresh</TabsTrigger>
          <TabsTrigger value="verify-email">Verify Email</TabsTrigger>
          <TabsTrigger value="password-reset">Password Reset</TabsTrigger>
        </TabsList>
        <TabsContent value="register" className="mt-4">
          <RegisterTab />
        </TabsContent>
        <TabsContent value="login" className="mt-4">
          <LoginTab />
        </TabsContent>
        <TabsContent value="logout" className="mt-4">
          <LogoutTab />
        </TabsContent>
        <TabsContent value="refresh" className="mt-4">
          <RefreshTab />
        </TabsContent>
        <TabsContent value="verify-email" className="mt-4">
          <VerifyEmailTab />
        </TabsContent>
        <TabsContent value="password-reset" className="mt-4">
          <PasswordResetTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
