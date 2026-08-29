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
  pos: CAPABILITIES.salesPost,
  accounting: CAPABILITIES.salesVerifyView,
  "customer-orders": [CAPABILITIES.customerOrdersView, CAPABILITIES.salesView],
  products: CAPABILITIES.productsView,
  inventory: CAPABILITIES.inventoryView,
  reports: CAPABILITIES.reportsView,
  users: CAPABILITIES.usersView,
  branches: CAPABILITIES.branchesView,
  offline: "offline-sales:activate-device",
  "stock-transfers": CAPABILITIES.stockTransfersView,
} as const satisfies Record<string, Capability | readonly Capability[]>;

function pageCapability(pathname: string): Capability | readonly Capability[] | null {
  if (pathname === "/users/roles" || pathname.startsWith("/users/roles/")) {
    return CAPABILITIES.rolesView;
  }
  if (pathname === "/customer-orders" || pathname === "/customer-orders/") {
    return [CAPABILITIES.customerOrdersView, CAPABILITIES.salesView];
  }
  if (pathname === "/customer-orders/create") {
    return CAPABILITIES.customerOrdersCreate;
  }
  if (/^\/customer-orders\/[^/]+\/release\/?$/.test(pathname)) {
    return "customer-orders:release";
  }
  if (pathname.startsWith("/customer-orders/")) {
    return CAPABILITIES.customerOrdersView;
  }
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
          status: true,
          roleDefinitionId: true,
          accessRole: {
            select: { isOwner: true, permissions: true },
          },
          locationAssignments: {
            where: {
              location: {
                isActive: true,
                OR: [{ type: "BRANCH" }, { code: "SR", type: "WAREHOUSE" }],
              },
            },
            select: { locationId: true },
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
      roleDefinitionId: user.roleDefinitionId,
      capabilities: user.accessRole.permissions,
      isOwner: user.accessRole.isOwner,
      locationIds: user.locationAssignments.map(({ locationId }) => locationId),
    };

    if (
      !(Array.isArray(capability)
        ? capability.some((item) => evaluateAccess(context, item))
        : evaluateAccess(context, capability as Capability))
    ) {
      return NextResponse.redirect(new URL("/access-denied", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
