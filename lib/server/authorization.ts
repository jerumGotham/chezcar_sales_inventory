import "server-only";

import type { UserRole } from "@prisma/client";

import { auth } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

export type AuthContext = {
  userId: string;
  role: UserRole;
  locationId: string | null;
};

export const AUTHENTICATED_ROLES = [
  "ADMIN",
  "STOCK_STAFF",
  "BRANCH_STAFF",
  "ACCOUNTING_STAFF",
] as const satisfies readonly UserRole[];

export class AuthenticationError extends Error {}
export class AuthorizationError extends Error {}

export async function requireUser(
  headers: Headers,
  allowedRoles: readonly UserRole[],
): Promise<AuthContext> {
  const session = await auth.api.getSession({ headers });

  if (!session) {
    throw new AuthenticationError("Authentication required");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, status: true, locationId: true },
  });

  if (!user || user.status !== "ACTIVE") {
    throw new AuthenticationError("Active user account required");
  }

  if (!allowedRoles.includes(user.role)) {
    throw new AuthorizationError("Insufficient permissions");
  }

  if (user.role === "BRANCH_STAFF" && !user.locationId) {
    throw new AuthorizationError("Branch Staff requires an assigned location");
  }

  return {
    userId: user.id,
    role: user.role,
    locationId: user.locationId,
  };
}

export function authorizationErrorResponse(error: unknown) {
  if (error instanceof AuthenticationError) {
    return Response.json(
      { error: { code: "UNAUTHENTICATED", message: error.message } },
      { status: 401 },
    );
  }

  if (error instanceof AuthorizationError) {
    return Response.json(
      { error: { code: "FORBIDDEN", message: error.message } },
      { status: 403 },
    );
  }

  throw error;
}
