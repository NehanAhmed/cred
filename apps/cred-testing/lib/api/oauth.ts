export const OAUTH_ROUTES = {
  google: "/api/auth/google",
  googleCallback: "/api/auth/google/callback",
  github: "/api/auth/github",
  githubCallback: "/api/auth/github/callback",
} as const

export function getOAuthInitUrl(provider: "google" | "github"): string {
  return OAUTH_ROUTES[provider]
}
