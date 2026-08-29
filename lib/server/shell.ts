import "server-only";

import {
  ANONYMOUS_SHELL_ACCESS,
  type LocationScopeDto,
  type ShellAccessDto,
  type ShellMenuEntryDto,
} from "../contracts/access";
import { menus } from "../menu";
import { auth } from "./auth";
import {
  capabilitiesFor,
  hasAllLocationAccess,
  type Capability,
  type PersistedAccessContext,
  validatePersistedAssignment,
} from "./policy/access";
import { prisma } from "./prisma";

const LOCATION_SCOPE_COOKIE = "chezcar-admin-location-scope";

function readCookie(headers: Headers, name: string): string | null {
  const pair = headers
    .get("cookie")
    ?.split(";")
    .find((item) => item.slice(0, item.indexOf("=")).trim() === name);
  if (!pair) return null;
  try {
    return decodeURIComponent(pair.slice(pair.indexOf("=") + 1).trim());
  } catch {
    return null;
  }
}

async function scopeFor(
  headers: Headers,
  context: PersistedAccessContext,
): Promise<LocationScopeDto> {
  const selectedLocationId =
    readCookie(headers, LOCATION_SCOPE_COOKIE) ??
    (context.locationIds.length === 1 ? context.locationIds[0] : null);
  const permittedIds = hasAllLocationAccess(context) ? undefined : context.locationIds;
  const selected = selectedLocationId
    ? await prisma.location.findFirst({
        where: {
          id: selectedLocationId,
          isActive: true,
          ...(permittedIds ? { id: { in: [...permittedIds] } } : {}),
        },
        select: { id: true, code: true, name: true },
      })
    : null;
  if (selected) {
    return {
      kind: "location",
      label: `${selected.name} (${selected.code})`,
      locationId: selected.id,
      code: selected.code,
    };
  }
  if (hasAllLocationAccess(context)) {
    return { kind: "all-locations", label: "All locations", locationId: null, code: null };
  }
  return {
    kind: "assigned-locations",
    label: `${context.locationIds.length} assigned location${context.locationIds.length === 1 ? "" : "s"}`,
    locationId: context.locationIds.length === 1 ? context.locationIds[0] : null,
    code: null,
  };
}

export async function loadShellAccess(headers: Headers): Promise<ShellAccessDto> {
  const session = await auth.api.getSession({ headers });
  if (!session) return ANONYMOUS_SHELL_ACCESS;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      roleDefinitionId: true,
      accessRole: { select: { name: true, isOwner: true, permissions: true } },
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
  if (!user || user.status !== "ACTIVE") return ANONYMOUS_SHELL_ACCESS;

  const context: PersistedAccessContext = {
    userId: user.id,
    roleDefinitionId: user.roleDefinitionId,
    capabilities: user.accessRole.permissions,
    isOwner: user.accessRole.isOwner,
    locationIds: user.locationAssignments.map(({ locationId }) => locationId),
  };
  if (!validatePersistedAssignment(context)) return ANONYMOUS_SHELL_ACCESS;

  const capabilities = capabilitiesFor(context);
  const permittedCapabilities = new Set(capabilities);
  const menu: ShellMenuEntryDto[] = menus
    .filter((item) =>
      Array.isArray(item.capability)
        ? item.capability.some((capability) => permittedCapabilities.has(capability))
        : permittedCapabilities.has(item.capability as Capability),
    )
    .map(({ label, href, iconId }) => ({ label, href, icon: iconId }));

  return {
    authenticated: true,
    identity: {
      name: user.name,
      email: user.email,
      roleDefinitionId: user.roleDefinitionId,
      roleName: user.accessRole.name,
      isOwner: user.accessRole.isOwner,
    },
    scope: await scopeFor(headers, context),
    capabilities,
    menu,
  };
}
