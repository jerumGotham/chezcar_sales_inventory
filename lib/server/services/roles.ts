import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma, type RoleScope } from "@prisma/client";
import { z } from "zod";

import {
  CAPABILITY_IDS,
  OWNER_ONLY_CAPABILITY_IDS,
  type CapabilityId,
  type CreateRoleRequest,
  type RoleDefinitionDto,
  type UpdateRoleRequest,
} from "@/lib/contracts/roles";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
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
  scope: true,
  permissions: true,
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
    scope: role.scope,
    permissions:
      role.scope === "OWNER"
        ? [...CAPABILITY_IDS]
        : role.permissions.filter((permission): permission is CapabilityId =>
            known.has(permission),
          ),
    isSystem: role.isSystem,
    isOwner: role.scope === "OWNER",
    isAssignable: role.scope !== "OWNER",
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

function assertAssignablePermissions(permissions: readonly CapabilityId[]) {
  const ownerOnly = new Set<CapabilityId>(OWNER_ONLY_CAPABILITY_IDS);
  if (permissions.some((permission) => ownerOnly.has(permission))) {
    throw roleFailure(400, "OWNER_PERMISSION_ONLY", "Administration permissions are reserved for the owner Admin");
  }
}

function samePermissions(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((permission, index) => permission === right[index]);
}

function roleFailure(status: number, code: string, message: string): RoleMaintenanceError {
  return new RoleMaintenanceError(status, code, message);
}

export async function requireOwnerRoleManager(headers: Headers) {
  const actor = await requireCapability(headers, "roles:manage");
  if (!actor.isOwner) throw new AuthorizationError("Insufficient permissions");
  return actor;
}

export async function listRoleDefinitions(): Promise<RoleDefinitionDto[]> {
  const roles = await prisma.roleDefinition.findMany({
    select: roleSelect,
    orderBy: [{ scope: "asc" }, { name: "asc" }],
  });
  return roles.map(toRoleDto);
}

export async function listAssignableRoleDefinitions() {
  return prisma.roleDefinition.findMany({
    where: { scope: { not: "OWNER" } },
    select: { id: true, name: true, description: true, scope: true },
    orderBy: { name: "asc" },
  });
}

export async function getRoleDefinition(roleId: string): Promise<RoleDefinitionDto> {
  const role = await prisma.roleDefinition.findUnique({
    where: { id: roleId },
    select: roleSelect,
  });
  if (!role) throw roleFailure(404, "ROLE_NOT_FOUND", "Role not found");
  return toRoleDto(role);
}

export async function createRoleDefinition(input: CreateRoleRequest): Promise<RoleDefinitionDto> {
  assertAssignablePermissions(input.permissions);
  try {
    const role = await prisma.roleDefinition.create({
      data: {
        key: `custom-${randomUUID()}`,
        name: input.name,
        description: input.description,
        scope: input.scope,
        permissions: normalizePermissions(input.permissions),
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
      if (current.scope === "OWNER") {
        throw roleFailure(403, "OWNER_ROLE_IMMUTABLE", "The owner Admin role cannot be changed");
      }
      if (current.version !== input.version) {
        throw roleFailure(409, "ROLE_VERSION_CONFLICT", "This role was changed by another request. Reload and try again.");
      }

      const nextScope = input.scope ?? current.scope;
      if (nextScope !== current.scope && current._count.users > 0) {
        throw roleFailure(409, "ROLE_SCOPE_ASSIGNED", "Remove all user assignments before changing this role's scope");
      }
      const nextPermissions = input.permissions
        ? normalizePermissions(input.permissions)
        : normalizePermissions(current.permissions as CapabilityId[]);
      assertAssignablePermissions(nextPermissions);
      const permissionsChanged = !samePermissions(
        normalizePermissions(current.permissions as CapabilityId[]),
        nextPermissions,
      );

      const result = await tx.roleDefinition.updateMany({
        where: { id: roleId, version: input.version, scope: { not: "OWNER" } },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined ? {} : { description: input.description }),
          scope: nextScope as RoleScope,
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
