"use client"

import * as React from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type EndpointSectionProps = {
  title: string
  description?: string
  method?: string
  path?: string
  children: React.ReactNode
}

const METHOD_COLORS: Record<string, string> = {
  GET: "text-green-500",
  POST: "text-blue-500",
  PUT: "text-orange-500",
  DELETE: "text-red-500",
}

export function EndpointSection({
  title,
  description,
  method,
  path,
  children,
}: EndpointSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {method && path && (
            <div className="shrink-0 font-mono text-xs">
              <span className={METHOD_COLORS[method]}>{method}</span>
              <span className="ml-2 text-muted-foreground">{path}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}
