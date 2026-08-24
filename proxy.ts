import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  const isSignIn = request.nextUrl.pathname === "/sign-in";
  const user = session
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true, status: true },
      })
    : null;

  if ((!session || !user || user.status !== "ACTIVE") && !isSignIn) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set(
      "callbackUrl",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(signInUrl);
  }

  if (session && user?.status === "ACTIVE" && isSignIn) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (
    request.nextUrl.pathname.startsWith("/products") &&
    user &&
    user.role !== "ADMIN" &&
    user.role !== "STOCK_STAFF"
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (
    (request.nextUrl.pathname.startsWith("/inventory/receive") ||
      request.nextUrl.pathname.startsWith("/inventory/transfer")) &&
    user &&
    user.role !== "ADMIN" &&
    user.role !== "STOCK_STAFF"
  ) {
    return NextResponse.redirect(new URL("/inventory", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
