import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (!pathname.startsWith("/api/")) {
    return NextResponse.next()
  }

  const target = `${BACKEND_URL}${pathname}${search}`

  return NextResponse.rewrite(new URL(target))
}

export const config = {
  matcher: "/api/:path*",
}
