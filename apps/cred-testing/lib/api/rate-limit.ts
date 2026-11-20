import { apiCall, type ApiResult } from "@/lib/api-client"
import { randomBytes } from "crypto"

const secureRandomSuffix = (length = 8): string =>
  randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length)

export type RateLimiterDef = {
  id: string
  name: string
  endpoint: string
  method: "GET" | "POST" | "PUT" | "DELETE"
  window: string
  maxRequests: number
  requiresAuth: boolean
  description: string
  getBody?: () => Record<string, string> | undefined
}

export const RATE_LIMITER_DEFS: RateLimiterDef[] = [
  {
    id: "health",
    name: "Health",
    endpoint: "/api/health",
    method: "GET",
    window: "1 min",
    maxRequests: 30,
    requiresAuth: false,
    description: "Health check endpoint rate limiter",
  },
  {
    id: "register",
    name: "Register",
    endpoint: "/api/auth",
    method: "POST",
    window: "60 min",
    maxRequests: 3,
    requiresAuth: false,
    description: "Account creation rate limiter",
    getBody: () => ({
      username: `rate-test-${secureRandomSuffix(8)}`,
      email: `rate-test-${secureRandomSuffix(8)}@example.com`,
      password: "RateLimitTest1",
    }),
  },
  {
    id: "login-global",
    name: "Login (Global)",
    endpoint: "/api/auth/login",
    method: "POST",
    window: "15 min",
    maxRequests: 20,
    requiresAuth: false,
    description: "Global auth rate limiter — applies to all auth endpoints",
    getBody: () => ({
      email: "rate-limit-test@example.com",
      password: "RateLimitTest1",
    }),
  },
  {
    id: "login-specific",
    name: "Login (Specific)",
    endpoint: "/api/auth/login",
    method: "POST",
    window: "15 min",
    maxRequests: 5,
    requiresAuth: false,
    description: "Login-specific rate limiter (stricter than global)",
    getBody: () => ({
      email: "rate-limit-test@example.com",
      password: "RateLimitTest1",
    }),
  },
  {
    id: "forgot-password",
    name: "Forgot Password",
    endpoint: "/api/auth/forgot-password",
    method: "POST",
    window: "60 min",
    maxRequests: 3,
    requiresAuth: false,
    description: "Password reset request rate limiter",
    getBody: () => ({ email: "rate-limit-test@example.com" }),
  },
  {
    id: "refresh",
    name: "Refresh",
    endpoint: "/api/auth/refresh",
    method: "POST",
    window: "15 min",
    maxRequests: 10,
    requiresAuth: true,
    description: "Token refresh rate limiter",
  },
  {
    id: "verify-email",
    name: "Verify Email",
    endpoint: "/api/auth/verify-email/test-dummy-token",
    method: "GET",
    window: "15 min",
    maxRequests: 10,
    requiresAuth: false,
    description: "Email verification rate limiter (uses dummy token)",
  },
  {
    id: "reset-password",
    name: "Reset Password",
    endpoint: "/api/auth/reset-password/test-dummy-token",
    method: "POST",
    window: "15 min",
    maxRequests: 5,
    requiresAuth: false,
    description: "Password reset rate limiter (uses dummy token)",
    getBody: () => ({ password: "NewRateLimit1" }),
  },
  {
    id: "logout",
    name: "Logout",
    endpoint: "/api/auth/logout",
    method: "POST",
    window: "15 min",
    maxRequests: 20,
    requiresAuth: true,
    description: "Logout rate limiter",
  },
  {
    id: "oauth",
    name: "OAuth",
    endpoint: "/api/auth/google",
    method: "GET",
    window: "15 min",
    maxRequests: 10,
    requiresAuth: false,
    description: "OAuth initiation rate limiter (will redirect)",
  },
  {
    id: "profile",
    name: "Profile (GET)",
    endpoint: "/api/profile/me",
    method: "GET",
    window: "15 min",
    maxRequests: 50,
    requiresAuth: true,
    description: "Profile retrieval rate limiter",
  },
  {
    id: "profile-update",
    name: "Profile (PUT)",
    endpoint: "/api/profile/me",
    method: "PUT",
    window: "15 min",
    maxRequests: 50,
    requiresAuth: true,
    description: "Profile update rate limiter",
    getBody: () => ({ bio: `Rate limit test ${Date.now()}` }),
  },
]

export function fireRequest(def: RateLimiterDef): Promise<ApiResult<unknown>> {
  const body = def.getBody ? def.getBody() : undefined

  return apiCall<unknown>(def.endpoint, {
    method: def.method,
    ...(body ? { body } : {}),
  })
}
