"use client"

import { useState, useCallback } from "react"
import type { ApiResult } from "@/lib/api-client"

export function useApiCall<T>() {
  const [result, setResult] = useState<ApiResult<T> | null>(null)
  const [isPending, setIsPending] = useState(false)

  const execute = useCallback(async (fn: () => Promise<ApiResult<T>>) => {
    setIsPending(true)
    try {
      const res = await fn()
      setResult(res)
      return res
    } finally {
      setIsPending(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setIsPending(false)
  }, [])

  return { result, isPending, execute, reset }
}
