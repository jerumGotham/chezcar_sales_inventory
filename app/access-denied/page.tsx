import type { Metadata } from "next";
import Link from "next/link";
import { ShieldX } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Access Denied | Chezcar",
};

export default function AccessDeniedPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md border-border bg-card text-center shadow-sm">
        <CardContent className="flex flex-col items-center gap-4 p-8">
          <ShieldX
            aria-hidden="true"
            className="size-12 text-muted-foreground"
          />
          <h1 className="text-xl font-semibold text-foreground">
            Access denied
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Your account does not have access to this page. Return to the
            dashboard to continue.
          </p>
          {/* Static primary-button classes: this page is a server component
              and buttonVariants lives in a client-only module. */}
          <Link
            href="/dashboard"
            className="focus-visible:ring-ring/50 inline-flex h-8 items-center justify-center rounded-lg bg-emerald-600 px-2.5 text-sm font-medium whitespace-nowrap text-white transition-colors outline-none select-none hover:bg-emerald-700 focus-visible:ring-3"
          >
            Back to Dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
