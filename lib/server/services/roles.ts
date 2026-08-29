import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  CAPABILITY_IDS,
  type CapabilityId,
  type CreateRoleRequest,
  type RoleDefinitionDto,
  type UpdateRoleRequest,
} from "@/lib/contracts/roles";
import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import type { PersistedAccessContext } from "@/lib/server/policy/access";
import { prisma } from "@/lib/server/prisma";

export class RoleMaintenanceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RoleMaintenanceError";
  }
}

const roleSelect = {
  id: true,
  key: true,
  name: true,
  description: true,
  permissions: true,
  isOwner: true,
  isSystem: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { users: true } },
} satisfies Prisma.RoleDefinitionSelect;

type RoleRecord = Prisma.RoleDefinitionGetPayload<{ select: typeof roleSelect }>;

function toRoleDto(role: RoleRecord): RoleDefinitionDto {
  const known = new Set<string>(CAPABILITY_IDS);
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    permissions:
      role.isOwner
        ? [...CAPABILITY_IDS]
        : role.permissions.filter((permission): permission is CapabilityId =>
            known.has(permission),
          ),
    isSystem: role.isSystem,
    isOwner: role.isOwner,
    isAssignable: !role.isOwner,
    assignedUserCount: role._count.users,
    version: role.version,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

function normalizePermissions(permissions: readonly CapabilityId[]): CapabilityId[] {
  const requested = new Set(permissions);
  return CAPABILITY_IDS.filter((permission) => requested.has(permission));
}

function samePermissions(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((permission, index) => permission === right[index]);
}

function roleFailure(status: number, code: string, message: string): RoleMaintenanceError {
  return new RoleMaintenanceError(status, code, message);
}

function assertGrantCeiling(
  actor: PersistedAccessContext,
  permissions: readonly string[],
): void {
  if (
    !actor.isOwner &&
    permissions.some((permission) => !actor.capabilities.includes(permission))
  ) {
    throw roleFailure(403, "ROLE_GRANT_EXCEEDS_ACTOR", "A role cannot grant access you do not hold");
  }
}

export async function requireRoleManager(
  headers: Headers,
  capability: CapabilityId,
) {
  return requireCapability(headers, capability);
}

export async function listRoleDefinitions(): Promise<RoleDefinitionDto[]> {
  const roles = await prisma.roleDefinition.findMany({
    select: roleSelect,
    orderBy: [{ isOwner: "desc" }, { name: "asc" }],
  });
  return roles.map(toRoleDto);
}

export async function listAssignableRoleDefinitions(actor: PersistedAccessContext) {
  const roles = await prisma.roleDefinition.findMany({
    where: { isOwner: false },
    select: { id: true, name: true, description: true, permissions: true },
    orderBy: { name: "asc" },
  });
  const known = new Set<string>(CAPABILITY_IDS);
  return roles
    .map((role) => ({
      ...role,
      permissions: role.permissions.filter((permission): permission is CapabilityId => known.has(permission)),
    }))
    .filter(
      (role) =>
        actor.isOwner ||
        role.permissions.every((permission) => actor.capabilities.includes(permission)),
    );
}

export async function getRoleDefinition(roleId: string): Promise<RoleDefinitionDto> {
  const role = await prisma.roleDefinition.findUnique({
    where: { id: roleId },
    select: roleSelect,
  });
  if (!role) throw roleFailure(404, "ROLE_NOT_FOUND", "Role not found");
  return toRoleDto(role);
}

export async function createRoleDefinition(
  actor: PersistedAccessContext,
  input: CreateRoleRequest,
): Promise<RoleDefinitionDto> {
  const permissions = normalizePermissions(input.permissions);
  assertGrantCeiling(actor, permissions);
  try {
    const role = await prisma.roleDefinition.create({
      data: {
        key: `custom-${randomUUID()}`,
        name: input.name,
        description: input.description,
        // Retained only for compatibility with the additive legacy schema.
        scope: "BUSINESS_WIDE",
        permissions,
      },
      select: roleSelect,
    });
    return toRoleDto(role);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw roleFailure(409, "ROLE_NAME_IN_USE", "A role with this name already exists");
    }
    throw error;
  }
}

export async function updateRoleDefinition(
  actor: PersistedAccessContext,
  roleId: string,
  input: UpdateRoleRequest,
): Promise<RoleDefinitionDto> {
  try {
    const role = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "RoleDefinition" WHERE "id" = ${roleId} FOR UPDATE`;
      const current = await tx.roleDefinition.findUnique({
        where: { id: roleId },
        select: roleSelect,
      });
      if (!current) throw roleFailure(404, "ROLE_NOT_FOUND", "Role not found");
      if (current.isOwner) {
        throw roleFailure(403, "OWNER_ROLE_IMMUTABLE", "The owner Admin role cannot be changed");
      }
      if (!actor.isOwner) {
        const assignedToActor = await tx.user.findFirst({
          where: { id: actor.userId, roleDefinitionId: roleId },
          select: { id: true },
        });
        if (assignedToActor) {
          throw roleFailure(403, "SELF_ROLE_EDIT_FORBIDDEN", "You cannot edit your own assigned role");
        }
        assertGrantCeiling(actor, current.permissions);
      }
      if (current.version !== input.version) {
        throw roleFailure(409, "ROLE_VERSION_CONFLICT", "This role was changed by another request. Reload and try again.");
      }

      const nextPermissions = input.permissions
        ? normalizePermissions(input.permissions)
        : normalizePermissions(current.permissions as CapabilityId[]);
      assertGrantCeiling(actor, nextPermissions);
      const permissionsChanged = !samePermissions(
        normalizePermissions(current.permissions as CapabilityId[]),
        nextPermissions,
      );
      if (
        current.permissions.includes("locations:all") &&
        !nextPermissions.includes("locations:all")
      ) {
        const invalidUser = await tx.user.findFirst({
          where: {
            roleDefinitionId: roleId,
            locationAssignments: {
              none: {
                location: {
                  isActive: true,
                  OR: [{ type: "BRANCH" }, { code: "SR", type: "WAREHOUSE" }],
                },
              },
            },
          },
          select: { id: true },
        });
        if (invalidUser) {
          throw roleFailure(
            409,
            "LOCATION_ASSIGNMENT_REQUIRED",
            "Assign at least one active location to every user before removing all-location access",
          );
        }
      }

      const result = await tx.roleDefinition.updateMany({
        where: { id: roleId, version: input.version, isOwner: false },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined ? {} : { description: input.description }),
          permissions: nextPermissions,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw roleFailure(409, "ROLE_VERSION_CONFLICT", "This role was changed by another request. Reload and try again.");
      }

      if (permissionsChanged) {
        await tx.session.deleteMany({
          where: { user: { roleDefinitionId: roleId } },
        });
      }

      return tx.roleDefinition.findUniqueOrThrow({
        where: { id: roleId },
        select: roleSelect,
      });
    });
    return toRoleDto(role);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw roleFailure(409, "ROLE_NAME_IN_USE", "A role with this name already exists");
    }
    throw error;
  }
}

export function rolesErrorResponse(error: unknown, context: string): Response {
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid role request" } },
      { status: 400 },
    );
  }
  if (error instanceof RoleMaintenanceError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  try {
    return authorizationErrorResponse(error);
  } catch (unexpectedError) {
    console.error(context, unexpectedError);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: context } },
      { status: 500 },
    );
  }
}
