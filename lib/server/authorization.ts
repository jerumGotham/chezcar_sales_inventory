import "server-only";

import {
  capabilitiesFor,
  evaluateAccess,
  type Capability,
  type PersistedAccessContext,
  validatePersistedAssignment,
} from "./policy/access";

export type AuthContext = PersistedAccessContext;

export class AuthenticationError extends Error {}
export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";
  readonly status = 403;
}

export function assertCapability(
  context: AuthContext,
  capability: Capability,
): void {
  if (!evaluateAccess(context, capability)) {
    throw new AuthorizationError("Insufficient permissions");
  }
}

export function assertAnyCapability(
  context: AuthContext,
  capabilities: readonly Capability[],
): void {
  if (!capabilities.some((capability) => evaluateAccess(context, capability))) {
    throw new AuthorizationError("Insufficient permissions");
  }
}

async function loadPersistedAccessContext(
  headers: Headers,
): Promise<PersistedAccessContext> {
  const [{ auth }, { prisma }] = await Promise.all([
    import("@/lib/server/auth"),
    import("@/lib/server/prisma"),
  ]);
  const session = await auth.api.getSession({ headers });

  if (!session) {
    throw new AuthenticationError("Authentication required");
  }

  const user = await prisma.user.findUnique({
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
  });

  if (!user || user.status !== "ACTIVE") {
    throw new AuthenticationError("Active user account required");
  }

  const context: PersistedAccessContext = {
    userId: user.id,
    roleDefinitionId: user.roleDefinitionId,
    capabilities: user.accessRole.permissions,
    isOwner: user.accessRole.isOwner,
    locationIds: user.locationAssignments.map((assignment) => assignment.locationId),
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
  assertCapability(context, capability);

  return context;
}

export async function requireAnyCapability(
  headers: Headers,
  capabilities: readonly Capability[],
): Promise<AuthContext> {
  const context = await loadPersistedAccessContext(headers);
  assertAnyCapability(context, capabilities);
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
