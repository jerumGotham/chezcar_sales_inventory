"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * `required` puts a red asterisk after the text, the one mark every form uses
 * for a field that must be filled. It is a visual cue only: the input still
 * needs its own `required` or validation.
 */
function Label({ className, required, children, ...props }: React.ComponentProps<"label"> & { required?: boolean }) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      {required ? (
        <span aria-hidden="true" className="-ml-1.5 text-red-600 dark:text-red-400">
          *
        </span>
      ) : null}
    </label>
  )
}

export { Label }
