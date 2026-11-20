type RequestOptions = {
  method: "GET" | "POST" | "PUT" | "DELETE"
  body?: unknown
}

type ValidationIssue = {
  code: string
  path: string[]
  message: string
  expected?: string
  received?: string
}

export type ApiSuccess<T> = {
  kind: "success"
  status: number
  headers: Headers
  body: {
    success: true
    message: string
    data: T
  }
}

export type ApiError = {
  kind: "api-error"
  status: number
  headers: Headers
  body: {
    success: false
    message: string
    error: string
  }
}

export type ValidationError = {
  kind: "validation-error"
  status: number
  headers: Headers
  body: {
    errors: ValidationIssue[]
  }
}

export type RateLimitError = {
  kind: "rate-limit"
  status: number
  headers: Headers
  body: {
    message: string
  }
}

export type RedirectResult = {
  kind: "redirect"
  status: number
  headers: Headers
  location: string
}

export type NetworkError = {
  kind: "network-error"
  error: Error
  isCorsError?: boolean
}

export type ApiResult<T> =
  | ApiSuccess<T>
  | ApiError
  | ValidationError
  | RateLimitError
  | RedirectResult
  | NetworkError

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function classifyResponse<T>(
  status: number,
  headers: Headers,
  body: unknown
): ApiResult<T> {
  if (status === 302 && headers.has("location")) {
    return {
      kind: "redirect",
      status,
      headers,
      location: headers.get("location")!,
    }
  }

  if (!isRecord(body)) {
    return {
      kind: "network-error",
      error: new Error(`Unexpected response body: ${JSON.stringify(body)}`),
    }
  }

  if (status === 429) {
    return {
      kind: "rate-limit",
      status,
      headers,
      body: {
        message: (body.message as string) ?? "Too many requests",
      },
    }
  }

  if (
    "errors" in body &&
    Array.isArray(body.errors) &&
    body.errors.length > 0
  ) {
    return {
      kind: "validation-error",
      status,
      headers,
      body: {
        errors: body.errors as ValidationIssue[],
      },
    }
  }

  if (body.success === true) {
    return {
      kind: "success",
      status,
      headers,
      body: body as { success: true; message: string; data: T },
    }
  }

  if (body.success === false) {
    return {
      kind: "api-error",
      status,
      headers,
      body: body as { success: false; message: string; error: string },
    }
  }

  return {
    kind: "network-error",
    error: new Error(`Unclassifiable response: ${JSON.stringify(body)}`),
  }
}

const CSRF_COOKIE_NAME = "csrfToken"
const CSRF_HEADER_NAME = "X-CSRF-Token"

let cachedCsrfToken: string | null = null

function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null

  const prefix = `${CSRF_COOKIE_NAME}=`

  for (const entry of document.cookie.split(";")) {
    const trimmed = entry.trim()
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length))
    }
  }

  return null
}

async function getCsrfToken(): Promise<string | null> {
  const cookieToken = readCsrfCookie()
  if (cookieToken) {
    cachedCsrfToken = cookieToken
    return cookieToken
  }

  if (cachedCsrfToken) return cachedCsrfToken

  try {
    const response = await fetch("/api/auth/csrf-token", {
      method: "GET",
      credentials: "same-origin",
    })
    if (!response.ok) return null

    const json: unknown = await response.json()
    const token =
      isRecord(json) &&
      isRecord(json.data) &&
      typeof json.data.csrfToken === "string"
        ? json.data.csrfToken
        : null

    cachedCsrfToken = token
    return token
  } catch {
    return null
  }
}

export async function apiCall<T>(
  path: string,
  options: RequestOptions = { method: "GET" }
): Promise<ApiResult<T>> {
  try {
    const { method, body } = options

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    if (method !== "GET") {
      const csrfToken = await getCsrfToken()
      if (csrfToken) {
        headers[CSRF_HEADER_NAME] = csrfToken
      }
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    }

    if (body !== undefined) {
      fetchOptions.body = JSON.stringify(body)
    }

    const response = await fetch(path, fetchOptions)
    const clonedHeaders = new Headers(response.headers)

    const contentType = response.headers.get("content-type") ?? ""

    if (contentType.includes("application/json")) {
      const json = await response.json()
      return classifyResponse<T>(response.status, clonedHeaders, json)
    }

    if (response.redirected || response.status === 302) {
      return {
        kind: "redirect",
        status: response.status,
        headers: clonedHeaders,
        location: response.url,
      }
    }

    const text = await response.text()
    return {
      kind: "network-error",
      error: new Error(`Non-JSON response (${response.status}): ${text}`),
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    const isCorsError =
      /Failed to fetch|NetworkError|network error|ERR_NETWORK/i.test(
        err.message
      )
    return {
      kind: "network-error",
      error: err,
      isCorsError,
    }
  }
}
