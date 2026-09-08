"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";

export function BackjobPrintControls({ backjobId }: { backjobId: string }) {
  const printRequested = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let frame = 0;

    async function printWhenReady() {
      await document.fonts.ready;
      if (cancelled || printRequested.current) return;

      // Allow the font-ready record to paint before opening the print dialog.
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => {
          if (cancelled || printRequested.current) return;
          printRequested.current = true;
          window.print();
        });
      });
    }

    if (document.readyState === "complete") {
      void printWhenReady();
    } else {
      window.addEventListener("load", printWhenReady, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", printWhenReady);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 text-foreground print:hidden">
      <Link
        className={buttonVariants({ variant: "outline" })}
        href={`/inventory/returns-warranty/${backjobId}`}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Backjob
      </Link>
      <Button type="button" variant="outline" onClick={() => window.close()}>
        <X className="h-4 w-4" aria-hidden="true" />
        Close tab
      </Button>
      <Button type="button" onClick={() => {
        printRequested.current = true;
        window.print();
      }}>
        <Printer className="h-4 w-4" aria-hidden="true" />
        Print
      </Button>
    </div>
  );
}
