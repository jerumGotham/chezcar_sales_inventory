"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Every paged table had its own copy of this row, all of them below the table,
 * so reaching the next page meant scrolling past the rows first. One component,
 * placed above the table, keeps the controls where the reader already is.
 */
export function TablePagination({
  page,
  totalPages,
  onPageChange,
  busy = false,
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Disables both buttons while a fetch is in flight. */
  busy?: boolean;
  className?: string;
}) {
  const lastPage = Math.max(totalPages, 1);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <p className="text-muted-foreground text-sm">
        Page {page} of {lastPage}
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1 || busy}
        onClick={() => onPageChange(Math.max(page - 1, 1))}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Previous
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= lastPage || busy}
        onClick={() => onPageChange(Math.min(page + 1, lastPage))}
      >
        Next
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
