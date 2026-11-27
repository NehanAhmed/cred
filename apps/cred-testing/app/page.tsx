import { HealthCheck } from "@/components/health-check"
import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 p-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">
          cred-kit API Testing
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Interactive manual testing interface for the cred-kit authentication API
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link href="/auth">
            Authentication Module
            <ArrowRightIcon className="size-4" />
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/profile">
            Profile Module
            <ArrowRightIcon className="size-4" />
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/oauth">
            OAuth Module
            <ArrowRightIcon className="size-4" />
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/rate-limiting">
            Rate Limiting
            <ArrowRightIcon className="size-4" />
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/data-flow">
            Data Flow
            <ArrowRightIcon className="size-4" />
          </Link>
        </Button>
      </div>
      <HealthCheck />
    </div>
  )
}
