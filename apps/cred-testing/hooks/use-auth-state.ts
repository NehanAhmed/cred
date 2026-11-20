"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { getProfile } from "@/lib/api/profile"
import type { UserData } from "@/lib/api/auth"
import { toast } from "sonner"

export function useAuthState() {
  const [user, setUser] = useState<UserData | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const wasAuthenticatedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    getProfile().then((result) => {
      if (cancelled) {
        return
      }

      if (result.kind === "success") {
        setUser(result.body.data)
        setIsAuthenticated(true)
        wasAuthenticatedRef.current = true
      } else {
        setUser(null)
        setIsAuthenticated(false)
        wasAuthenticatedRef.current = false
      }
      setIsLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const checkAuth = useCallback(async () => {
    const result = await getProfile()
    if (result.kind === "success") {
      setUser(result.body.data)
      setIsAuthenticated(true)
      wasAuthenticatedRef.current = true
    } else {
      const wasActive = wasAuthenticatedRef.current
      setUser(null)
      setIsAuthenticated(false)
      wasAuthenticatedRef.current = false

      if (wasActive && result.kind === "api-error" && result.status === 401) {
        toast.error("Session expired — please log in again", {
          action: {
            label: "Login",
            onClick: () => (window.location.href = "/auth"),
          },
        })
      }
    }
    setIsLoading(false)
    return result
  }, [])

  const clearAuth = useCallback(() => {
    setUser(null)
    setIsAuthenticated(false)
    wasAuthenticatedRef.current = false
  }, [])

  return {
    user,
    isAuthenticated,
    isLoading,
    checkAuth,
    clearAuth,
  }
}
