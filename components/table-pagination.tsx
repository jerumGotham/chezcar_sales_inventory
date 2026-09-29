"use client";

import { useEffect, useRef } from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Every paged table had its own copy of this row. One component, placed in a
 * footer under the table, keeps the controls in the same place everywhere.
 *
 * Turning the page also carries the reader back to the first row. The controls
 * sit at the bottom, so without it the next page arrives already scrolled past
 * and row one is above the fold.
 */

/** Cleared so the first row lands under the sticky page header, not behind it. */
const STICKY_HEADER_ALLOWANCE = 96;

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
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef(false);
  const lastPage = Math.max(totalPages, 1);

  /*
   * Measured after the new page has been committed, never at the click. The
   * rows above the table change height as the page turns, so a position taken
   * before the render is already wrong by the time the scroll lands.
   *
   * Only a turn made from these buttons scrolls; a page set from elsewhere,
   * such as a filter reset, leaves the reader where they are.
   */
  useEffect(() => {
    if (!pendingScroll.current) return;
    pendingScroll.current = false;

    const footer = rootRef.current?.parentElement;
    // The footer follows the table, so the element before it is the table.
    const target = footer?.previousElementSibling ?? footer;
    if (!(target instanceof HTMLElement)) return;

    /*
     * Jumped rather than animated. The rows re-render as the new page arrives
     * and that cancels a smooth scroll partway, leaving the reader stranded
     * between two pages.
     */
    const top = target.getBoundingClientRect().top + window.scrollY - STICKY_HEADER_ALLOWANCE;
    window.scrollTo({ top: Math.max(top, 0), behavior: "instant" });
  }, [page]);

  const goTo = (next: number) => {
    if (next === page) return;
    pendingScroll.current = true;
    onPageChange(next);
  };

  return (
    <div ref={rootRef} className={cn("flex flex-wrap items-center gap-2", className)}>
      <p className="text-muted-foreground text-sm">
        Page {page} of {lastPage}
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1 || busy}
        onClick={() => goTo(Math.max(page - 1, 1))}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Previous
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= lastPage || busy}
        onClick={() => goTo(Math.min(page + 1, lastPage))}
      >
        Next
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
