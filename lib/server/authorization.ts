import "server-only";

import type { UserRole } from "@prisma/client";

import { auth } from "@/lib/server/auth";
import {
  capabilitiesFor,
  evaluateAccess,
  type Capability,
  type PersistedAccessContext,
  validatePersistedAssignment,
} from "./policy/access";
import { prisma } from "@/lib/server/prisma";

export type AuthContext = PersistedAccessContext;

export class AuthenticationError extends Error {}
export class AuthorizationError extends Error {}

async function loadPersistedAccessContext(
  headers: Headers,
): Promise<PersistedAccessContext> {
  const session = await auth.api.getSession({ headers });

  if (!session) {
    throw new AuthenticationError("Authentication required");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      role: true,
      status: true,
      locationId: true,
      roleDefinitionId: true,
      accessRole: {
        select: { scope: true, permissions: true },
      },
      location: {
        select: { id: true, code: true, type: true, isActive: true },
      },
    },
  });

  if (!user || user.status !== "ACTIVE") {
    throw new AuthenticationError("Active user account required");
  }

  const context: PersistedAccessContext = {
    userId: user.id,
    role: user.role,
    roleDefinitionId: user.roleDefinitionId,
    roleScope: user.accessRole.scope,
    capabilities: user.accessRole.permissions,
    isOwner: user.accessRole.scope === "OWNER",
    locationId: user.locationId,
    location: user.location,
  };

  if (!validatePersistedAssignment(context)) {
    throw new AuthorizationError("Invalid persisted access assignment");
  }

  return { ...context, capabilities: capabilitiesFor(context) };
}

export async function requireActiveUser(headers: Headers): Promise<AuthContext> {
  return loadPersistedAccessContext(headers);
}

export async function requireCapability(
  headers: Headers,
  capability: Capability,
): Promise<AuthContext> {
  const context = await loadPersistedAccessContext(headers);

  if (!evaluateAccess(context, capability)) {
    throw new AuthorizationError("Insufficient permissions");
  }

  return context;
}

// Compatibility boundary for the inventory route until its named-capability
// migration in Plan 01-14. All persisted assignment checks still apply.
export async function requireUser(
  headers: Headers,
  allowedRoles: readonly UserRole[],
): Promise<AuthContext> {
  const context = await loadPersistedAccessContext(headers);

  if (!allowedRoles.includes(context.role)) {
    throw new AuthorizationError("Insufficient permissions");
  }

  return context;
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
