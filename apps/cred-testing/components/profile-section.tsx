"use client"

import { useState, useMemo } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useAuthState } from "@/hooks/use-auth-state"
import { useApiCall } from "@/hooks/use-api-call"
import type { ApiResult } from "@/lib/api-client"
import {
  getProfile as getProfileApi,
  updateProfile as updateProfileApi,
  deleteAccount as deleteAccountApi,
  changePassword as changePasswordApi,
} from "@/lib/api/profile"
import { login as loginApi, refreshToken as refreshApi } from "@/lib/api/auth"
import { getAuditLogs } from "@/lib/api/audit"
import type { AuditLogData, AuditLogEntry } from "@/lib/api/audit"
import { profileUpdateSchema } from "@/lib/schemas/profile"
import { passwordChangeSchema } from "@/lib/schemas/auth"
import type { UserData, LoginData } from "@/lib/api/auth"
import type { ProfileUpdateInput } from "@/lib/api/profile"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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

function ProfileStatusBar({
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
            You are not logged in. Use the Authentication Module to log in.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function GetProfileTab() {
  const profileCall = useApiCall<UserData>()
  const { isAuthenticated } = useAuthState()

  const handleGetProfile = async () => {
    await profileCall.execute(() => getProfileApi())
  }

  return (
    <EndpointSection
      title="Get Profile"
      description="Retrieve the current user's profile. Rate limit: 50 per 15 minutes."
      method="GET"
      path="/api/profile/me"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button
            onClick={handleGetProfile}
            disabled={profileCall.isPending || !isAuthenticated}
          >
            {profileCall.isPending ? "Fetching..." : "Get Profile"}
          </Button>
          {!isAuthenticated && (
            <p className="text-xs text-muted-foreground">
              Log in first to fetch your profile
            </p>
          )}
        </div>

        <Card className="bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">
              Session Cookies
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-xs text-muted-foreground">
              The following httpOnly cookies should be present when
              authenticated:
            </p>
            <ul className="list-disc pl-4 text-xs text-muted-foreground">
              <li>
                <code className="rounded bg-muted px-1">token</code>
                {" — "}Access token (24h)
              </li>
              <li>
                <code className="rounded bg-muted px-1">refreshToken</code>
                {" — "}Refresh token (7d, path=/api/auth)
              </li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Note: httpOnly cookie values cannot be read from JavaScript
            </p>
          </CardContent>
        </Card>
      </div>

      <ResponseViewer
        result={profileCall.result}
        isPending={profileCall.isPending}
      />
    </EndpointSection>
  )
}

type UpdateFormValues = z.infer<typeof profileUpdateSchema>

function UpdateProfileTab() {
  const updateCall = useApiCall<UserData>()
  const { isAuthenticated, checkAuth } = useAuthState()
  const [loadPending, setLoadPending] = useState(false)

  const form = useForm<UpdateFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(profileUpdateSchema as any) as any,
    defaultValues: {
      username: "",
      bio: "",
      phoneNumber: "",
    },
  })

  const handleLoadProfile = async () => {
    setLoadPending(true)
    try {
      const result = await getProfileApi()
      if (result.kind === "success") {
        const p = result.body.data
        form.reset({
          username: p.username,
          bio: p.bio ?? "",
          phoneNumber: p.phoneNumber ?? "",
          gender: (p.gender ?? undefined) as
            "male" | "female" | "other" | undefined,
        })
        toast.success("Profile loaded into form")
      } else {
        toast.error("Failed to load profile")
      }
    } finally {
      setLoadPending(false)
    }
  }

  const onSubmit = form.handleSubmit(async (data) => {
    const payload: ProfileUpdateInput = {}
    if (data.username) payload.username = data.username
    if (data.bio) payload.bio = data.bio
    if (data.phoneNumber) payload.phoneNumber = data.phoneNumber
    if (data.gender) payload.gender = data.gender

    const res = await updateCall.execute(() => updateProfileApi(payload))
    if (res?.kind === "success") {
      toast.success("Profile updated!")
      await checkAuth()
    }
  })

  return (
    <EndpointSection
      title="Update Profile"
      description="Update profile fields. Rate limit: 50 per 15 minutes."
      method="PUT"
      path="/api/profile/me"
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleLoadProfile}
              disabled={loadPending || !isAuthenticated}
            >
              {loadPending ? "Loading..." : "Load Current Profile"}
            </Button>
            {!isAuthenticated && (
              <p className="text-xs text-muted-foreground">
                Log in first to load your profile
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input placeholder="johndoe" {...field} />
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
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input placeholder="+1234567890" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="bio"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bio</FormLabel>
                <FormControl>
                  <Input placeholder="Tell us about yourself..." {...field} />
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
                  onValueChange={field.onChange}
                  value={field.value ?? ""}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Not set" />
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

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={updateCall.isPending || !isAuthenticated}
            >
              {updateCall.isPending ? "Updating..." : "Update Profile"}
            </Button>
          </div>

          <Card className="bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">
                Known Limitations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              <ul className="list-disc pl-4">
                <li>
                  Falsy values (empty strings, null) are skipped by the
                  controller — you cannot clear a field via this form.
                </li>
                <li>
                  Use the &ldquo;Load Current Profile&rdquo; button to compare
                  before/after and see which fields changed.
                </li>
              </ul>
            </CardContent>
          </Card>
        </form>
      </Form>

      <ResponseViewer
        result={updateCall.result}
        isPending={updateCall.isPending}
      />
    </EndpointSection>
  )
}

function DeleteAccountTab() {
  const deleteCall = useApiCall<null>()
  const verifyCall = useApiCall<UserData>()
  const { isAuthenticated, checkAuth } = useAuthState()
  const [confirmStep, setConfirmStep] = useState(false)
  const [confirmText, setConfirmText] = useState("")

  const handleDelete = async () => {
    const res = await deleteCall.execute(() => deleteAccountApi())
    if (res?.kind === "success") {
      toast.success("Account deleted successfully")
      setConfirmStep(false)
      setConfirmText("")
    }
  }

  const handleVerifyPostDelete = async () => {
    await verifyCall.execute(() => checkAuth())
  }

  return (
    <EndpointSection
      title="Delete Account"
      description="Permanently delete your account. This action is irreversible."
      method="DELETE"
      path="/api/profile/me"
    >
      {!isAuthenticated ? (
        <p className="text-sm text-muted-foreground">
          Log in first to access this feature.
        </p>
      ) : (
        <div className="space-y-4">
          {!confirmStep ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                <p className="text-sm font-medium text-destructive">Warning</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  This will permanently delete your account and all associated
                  data. This action cannot be undone.
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={() => setConfirmStep(true)}
              >
                Delete Account
              </Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">
                Are you absolutely sure?
              </p>
              <p className="text-sm text-muted-foreground">
                Type <strong>DELETE</strong> to confirm:
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={confirmText !== "DELETE" || deleteCall.isPending}
                >
                  {deleteCall.isPending ? "Deleting..." : "Confirm Deletion"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setConfirmStep(false)
                    setConfirmText("")
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <Card className="bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">
                Post-Deletion
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                After deletion, the JWT cookies are not automatically cleared.
                You should also call Logout from the Authentication Module.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleVerifyPostDelete}
                disabled={verifyCall.isPending}
              >
                {verifyCall.isPending ? "Verifying..." : "Verify Auth State"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <ResponseViewer
        result={deleteCall.result}
        isPending={deleteCall.isPending}
      />
      <ResponseViewer
        result={verifyCall.result}
        isPending={verifyCall.isPending}
      />
    </EndpointSection>
  )
}

type PasswordFormValues = z.infer<typeof passwordChangeSchema>

function ChangePasswordTab() {
  const changeCall = useApiCall<UserData>()
  const verifyNewCall = useApiCall<LoginData>()
  const verifyOldCall = useApiCall<LoginData>()
  const { user, isAuthenticated } = useAuthState()
  const [confirmNewPassword, setConfirmNewPassword] = useState("")
  const [passwordChanged, setPasswordChanged] = useState(false)
  const [lastNewPassword, setLastNewPassword] = useState("")
  const [lastOldPassword, setLastOldPassword] = useState("")

  const form = useForm<PasswordFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(passwordChangeSchema as any) as any,
    defaultValues: {
      currentPassword: "",
      newPassword: "",
    },
  })

  const newPassword = useWatch({ control: form.control, name: "newPassword" })

  const onSubmit = form.handleSubmit(async (data) => {
    if (data.newPassword !== confirmNewPassword) {
      toast.error("Passwords do not match")
      return
    }

    setLastOldPassword(data.currentPassword)
    setLastNewPassword(data.newPassword)

    const res = await changeCall.execute(() =>
      changePasswordApi({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      })
    )
    if (res?.kind === "success") {
      toast.success("Password changed successfully!")
      setPasswordChanged(true)
      form.reset()
      setConfirmNewPassword("")
    }
  })

  const handleVerifyNew = async () => {
    if (!user) return
    await verifyNewCall.execute(() =>
      loginApi({ email: user.email, password: lastNewPassword })
    )
  }

  const handleVerifyOld = async () => {
    if (!user) return
    await verifyOldCall.execute(() =>
      loginApi({ email: user.email, password: lastOldPassword })
    )
  }

  if (!isAuthenticated) {
    return (
      <EndpointSection
        title="Change Password"
        description="Update your account password."
        method="POST"
        path="/api/profile/me/change-password"
      >
        <p className="text-sm text-muted-foreground">
          Log in first to change your password.
        </p>
      </EndpointSection>
    )
  }

  return (
    <EndpointSection
      title="Change Password"
      description="Update your account password. Rate limit: 50 per 15 minutes."
      method="POST"
      path="/api/profile/me/change-password"
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormField
            control={form.control}
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current Password</FormLabel>
                <FormControl>
                  <Input type="password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="newPassword"
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
          <div className="space-y-2">
            <Label htmlFor="confirmNewPassword">Confirm New Password</Label>
            <Input
              id="confirmNewPassword"
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder="Re-enter your new password"
            />
            {confirmNewPassword && newPassword !== confirmNewPassword && (
              <p className="text-sm text-destructive">Passwords do not match</p>
            )}
          </div>

          <Button type="submit" disabled={changeCall.isPending}>
            {changeCall.isPending ? "Changing..." : "Change Password"}
          </Button>

          {passwordChanged && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Post-Change Verification
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Test that the new password works and the old one is rejected:
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleVerifyNew}
                    disabled={verifyNewCall.isPending}
                  >
                    {verifyNewCall.isPending
                      ? "Verifying..."
                      : "Verify New Password"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleVerifyOld}
                    disabled={verifyOldCall.isPending}
                  >
                    {verifyOldCall.isPending
                      ? "Verifying..."
                      : "Verify Old Password Fails"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">
                Known Limitations
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              <ul className="list-disc pl-4">
                <li>
                  The API response returns the pre-update user object, not the
                  updated state.
                </li>
              </ul>
            </CardContent>
          </Card>
        </form>
      </Form>

      <ResponseViewer
        result={changeCall.result}
        isPending={changeCall.isPending}
      />
      <ResponseViewer
        result={verifyNewCall.result}
        isPending={verifyNewCall.isPending}
      />
      <ResponseViewer
        result={verifyOldCall.result}
        isPending={verifyOldCall.isPending}
      />
    </EndpointSection>
  )
}

function AuditLogTab({
  isAuthenticated: isAuth,
}: {
  isAuthenticated: boolean
}) {
  const auditCall = useApiCall<AuditLogData>()
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [actionFilter, setActionFilter] = useState("")
  const [sortNewest, setSortNewest] = useState(true)

  const logs = useMemo(() => {
    if (auditCall.result?.kind !== "success") return []
    const entries = auditCall.result.body.data.logs
    const filtered = actionFilter
      ? entries.filter((l) => l.action === actionFilter)
      : entries
    const sorted = [...filtered].sort((a, b) => {
      const diff =
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      return sortNewest ? diff : -diff
    })
    return sorted
  }, [auditCall.result, actionFilter, sortNewest])

  const pagination = useMemo(() => {
    if (auditCall.result?.kind !== "success") return null
    return auditCall.result.body.data.pagination
  }, [auditCall.result])

  const actionTypes = useMemo(() => {
    if (auditCall.result?.kind !== "success") return []
    const types = new Set(auditCall.result.body.data.logs.map((l) => l.action))
    return Array.from(types).sort()
  }, [auditCall.result])

  const handleFetch = (p: number) => {
    auditCall.execute(() => getAuditLogs(p, limit))
    setPage(p)
  }

  return (
    <EndpointSection
      title="Audit Log Viewer"
      description="View paginated session audit logs for the authenticated user."
      method="GET"
      path="/api/profile/me/audit-logs"
    >
      <div className="space-y-4">
        {!isAuth ? (
          <p className="text-sm text-muted-foreground">
            Log in first to view audit logs.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => handleFetch(1)}
                disabled={auditCall.isPending}
              >
                {auditCall.isPending ? "Loading..." : "Fetch Logs"}
              </Button>
              {pagination && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => handleFetch(page - 1)}
                  >
                    Prev
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages}
                    {" ("}
                    {pagination.total} total{")"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= pagination.totalPages}
                    onClick={() => handleFetch(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-xs">Filter by action:</Label>
                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All actions</SelectItem>
                    {actionTypes.map((type: string) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSortNewest(!sortNewest)}
              >
                {sortNewest ? "Newest First" : "Oldest First"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Filtering &amp; sorting apply to the current page only.
              </span>
            </div>

            {auditCall.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                Fetching logs...
              </div>
            )}

            {!auditCall.isPending &&
              logs.length === 0 &&
              auditCall.result === null && (
                <p className="text-sm text-muted-foreground">
                  Click Fetch Logs to load data.
                </p>
              )}

            {!auditCall.isPending &&
              logs.length === 0 &&
              auditCall.result?.kind === "success" && (
                <p className="text-sm text-muted-foreground">
                  No log entries match the filter.
                </p>
              )}

            {logs.length > 0 && (
              <div className="space-y-2">
                {logs.map((entry: AuditLogEntry) => (
                  <Card key={entry._id}>
                    <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            entry.status === "success"
                              ? "default"
                              : entry.status === "failure"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {entry.status}
                        </Badge>
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {entry.action}
                        </code>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </CardHeader>
                    <CardContent className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span>
                          IP:{" "}
                          <code className="rounded bg-muted px-1 font-mono">
                            {entry.ip}
                          </code>
                        </span>
                        <span
                          className="max-w-xs truncate"
                          title={entry.userAgent}
                        >
                          UA: {entry.userAgent}
                        </span>
                      </div>
                      {entry.metadata &&
                        Object.keys(entry.metadata).length > 0 && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                              Metadata
                            </summary>
                            <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 font-mono text-xs">
                              {JSON.stringify(entry.metadata, null, 2)}
                            </pre>
                          </details>
                        )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <ResponseViewer
        result={auditCall.result}
        isPending={auditCall.isPending}
      />
    </EndpointSection>
  )
}

function SessionInspectorTab({
  user,
  isAuthenticated,
  isLoading,
  checkAuth,
  clearAuth,
}: {
  user: UserData | null
  isAuthenticated: boolean
  isLoading: boolean
  checkAuth: () => Promise<ApiResult<UserData>>
  clearAuth: () => void
}) {
  const profileCall = useApiCall<UserData>()
  const refreshCall = useApiCall<null>()
  const [lastRefreshTime, setLastRefreshTime] = useState<string | null>(null)
  const [sessionStart, setSessionStart] = useState<number | null>(null)

  const handleCheckAuth = async () => {
    const res = await profileCall.execute(() => getProfileApi())
    if (res?.kind === "success") {
      if (!sessionStart) {
        setSessionStart(Date.now())
      }
      toast.success("Session is active")
    } else {
      clearAuth()
    }
  }

  const handleRefreshSession = async () => {
    const res = await refreshCall.execute(() => refreshApi())
    if (res?.kind === "success") {
      setLastRefreshTime(new Date().toLocaleString())
      toast.success("Session refreshed!")
      await checkAuth()
    }
  }

  return (
    <EndpointSection
      title="Session & Cookie Inspector"
      description="Inspect the current authentication session state and expected cookies."
    >
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm">Auth Status</CardTitle>
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
                  <Badge
                    variant={user.isVerified ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {user.isVerified ? "Yes" : "No"}
                  </Badge>
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
                Not logged in. Use the Authentication Module to log in first.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Expected Cookies</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              The following httpOnly cookies are managed by the browser. Their
              values cannot be read from JavaScript.
            </p>
            <div className="space-y-1">
              <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
                <Badge
                  variant={isAuthenticated ? "default" : "outline"}
                  className="shrink-0"
                >
                  {isAuthenticated ? "Set" : "N/A"}
                </Badge>
                <div>
                  <code className="rounded bg-muted px-1 font-mono text-xs">
                    token
                  </code>
                  <span className="ml-2 text-xs text-muted-foreground">
                    Access token (24h expiry)
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
                <Badge
                  variant={isAuthenticated ? "default" : "outline"}
                  className="shrink-0"
                >
                  {isAuthenticated ? "Set" : "N/A"}
                </Badge>
                <div>
                  <code className="rounded bg-muted px-1 font-mono text-xs">
                    refreshToken
                  </code>
                  <span className="ml-2 text-xs text-muted-foreground">
                    Refresh token (7d expiry, path=/api/auth)
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
                <Badge variant="outline" className="shrink-0">
                  Transient
                </Badge>
                <div>
                  <code className="rounded bg-muted px-1 font-mono text-xs">
                    oauth_state
                  </code>
                  <span className="ml-2 text-xs text-muted-foreground">
                    Set only during OAuth flow, cleared on callback
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Session Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Session Status:</span>
              <span>{isAuthenticated ? "Active" : "Inactive"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last Refresh:</span>
              <span>
                {lastRefreshTime ?? (
                  <span className="text-muted-foreground">
                    Not yet refreshed
                  </span>
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Token Visibility:</span>
              <span className="text-xs text-muted-foreground">
                httpOnly — not readable from JS
              </span>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                size="sm"
                onClick={handleCheckAuth}
                disabled={profileCall.isPending}
              >
                {profileCall.isPending ? "Checking..." : "Check Auth"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRefreshSession}
                disabled={refreshCall.isPending}
              >
                {refreshCall.isPending ? "Refreshing..." : "Refresh Session"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {isAuthenticated && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Token Expiry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-xs text-muted-foreground">
                Estimated expiry times based on documented cookie durations:
              </p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Access Token:</span>
                  <span>24h from session start</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Refresh Token:</span>
                  <span>7d from session start</span>
                </div>
                {sessionStart && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Session Start:
                      </span>
                      <span className="text-xs">
                        {new Date(sessionStart).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Token Expires:
                      </span>
                      <span className="text-xs">
                        {new Date(
                          sessionStart + 24 * 60 * 60 * 1000
                        ).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Refresh Expires:
                      </span>
                      <span className="text-xs">
                        {new Date(
                          sessionStart + 7 * 24 * 60 * 60 * 1000
                        ).toLocaleString()}
                      </span>
                    </div>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Exact expiry is unavailable (httpOnly cookies)
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <ResponseViewer
        result={profileCall.result}
        isPending={profileCall.isPending}
      />
      <ResponseViewer
        result={refreshCall.result}
        isPending={refreshCall.isPending}
      />
    </EndpointSection>
  )
}

export function ProfileSection() {
  const { user, isAuthenticated, isLoading, checkAuth, clearAuth } =
    useAuthState()

  return (
    <div className="space-y-6">
      <ProfileStatusBar
        user={user}
        isAuthenticated={isAuthenticated}
        isLoading={isLoading}
      />
      <Tabs defaultValue="get-profile">
        <TabsList>
          <TabsTrigger value="get-profile">Get Profile</TabsTrigger>
          <TabsTrigger value="update-profile">Update Profile</TabsTrigger>
          <TabsTrigger value="change-password">Change Password</TabsTrigger>
          <TabsTrigger value="delete-account">Delete Account</TabsTrigger>
          <TabsTrigger value="audit-log">Audit Log</TabsTrigger>
          <TabsTrigger value="session-inspector">Session Inspector</TabsTrigger>
        </TabsList>
        <TabsContent value="get-profile" className="mt-4">
          <GetProfileTab />
        </TabsContent>
        <TabsContent value="update-profile" className="mt-4">
          <UpdateProfileTab />
        </TabsContent>
        <TabsContent value="change-password" className="mt-4">
          <ChangePasswordTab />
        </TabsContent>
        <TabsContent value="delete-account" className="mt-4">
          <DeleteAccountTab />
        </TabsContent>
        <TabsContent value="audit-log" className="mt-4">
          <AuditLogTab isAuthenticated={isAuthenticated} />
        </TabsContent>
        <TabsContent value="session-inspector" className="mt-4">
          <SessionInspectorTab
            user={user}
            isAuthenticated={isAuthenticated}
            isLoading={isLoading}
            checkAuth={checkAuth}
            clearAuth={clearAuth}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
