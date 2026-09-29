import type { ReactNode } from "react";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * What just happened, in the one place the reader is already looking.
 *
 * The two tones are the whole point: green means it worked, red means it did
 * not, and nothing else on these screens is either colour. Success banners used
 * to be drawn in the primary colour, which went colourless when the palette
 * did, so a save and a failure arrived in the same grey box.
 *
 * The tone also sets the live region. A success is role="status", which a
 * screen reader announces once the reader is idle; a failure is role="alert",
 * which interrupts, because it is not safe to carry on as though the change
 * had been saved.
 */
export type StatusTone = "success" | "error";

const TONES: Record<StatusTone, string> = {
  success:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
  error:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200",
};

export function StatusBanner({
  tone,
  children,
  onDismiss,
  className,
}: {
  tone: StatusTone;
  children: ReactNode;
  /** Shown as a dismiss button when given. */
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      role={tone === "success" ? "status" : "alert"}
      className={cn(
        "flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm",
        TONES[tone],
        className,
      )}
    >
      <p className="min-w-0 break-words">{children}</p>
      {onDismiss ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss notification"
          className="shrink-0"
          onClick={onDismiss}
        >
          <X aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
