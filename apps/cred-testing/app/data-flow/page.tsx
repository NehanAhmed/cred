import { DataFlowSection } from "@/components/data-flow-section"
import Link from "next/link"
import { ChevronLeftIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function DataFlowPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 p-6">
      <div>
        <Button
          variant="link"
          className="mb-4 h-auto p-0 text-muted-foreground hover:text-foreground"
          asChild
        >
          <Link href="/">
            <ChevronLeftIcon className="size-4" />
            Back to Health Check
          </Link>
        </Button>
        <h1 className="text-2xl font-medium tracking-tight">
          Data Flow Specifications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visual specifications for data flows, state machines, and cookie
          lifecycle per PRD Section 5
        </p>
      </div>
      <DataFlowSection />
    </div>
  )
}
