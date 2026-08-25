import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/server/auth";
import {
  CAPABILITIES,
  evaluateAccess,
  type Capability,
  type PersistedAccessContext,
} from "@/lib/server/policy/access";
import { prisma } from "@/lib/server/prisma";

const PAGE_CAPABILITIES = {
  dashboard: CAPABILITIES.dashboardView,
  customers: CAPABILITIES.customersView,
  "customer-orders": CAPABILITIES.customerOrdersView,
  products: CAPABILITIES.productsView,
  inventory: CAPABILITIES.inventoryView,
  users: CAPABILITIES.usersManage,
} as const satisfies Record<string, Capability>;

function pageCapability(pathname: string): Capability | null {
  const rootSegment = pathname.split("/")[1];
  return PAGE_CAPABILITIES[rootSegment as keyof typeof PAGE_CAPABILITIES] ?? null;
}

function safeLocalCallback(request: NextRequest): string {
  const callback = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  return callback.startsWith("/") && !callback.startsWith("//")
    ? callback
    : "/dashboard";
}

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  const isSignIn = request.nextUrl.pathname === "/sign-in";
  const user = session
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          role: true,
          status: true,
          locationId: true,
          location: {
            select: { id: true, code: true, type: true, isActive: true },
          },
        },
      })
    : null;

  if ((!session || !user || user.status !== "ACTIVE") && !isSignIn) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackUrl", safeLocalCallback(request));
    return NextResponse.redirect(signInUrl);
  }

  if (session && user?.status === "ACTIVE" && isSignIn) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const isAccessDenied = request.nextUrl.pathname === "/access-denied";
  const capability = pageCapability(request.nextUrl.pathname);

  if (user && !isSignIn && !isAccessDenied && capability) {
    const context: PersistedAccessContext = {
      userId: user.id,
      role: user.role,
      locationId: user.locationId,
      location: user.location,
    };

    if (!evaluateAccess(context, capability)) {
      return NextResponse.redirect(new URL("/access-denied", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
