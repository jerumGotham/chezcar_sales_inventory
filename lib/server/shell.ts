import "server-only";

import type { LocationType } from "@prisma/client";

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
  type PersistedAccessContext,
  validatePersistedAssignment,
} from "./policy/access";
import { prisma } from "./prisma";

const ADMIN_LOCATION_SCOPE_COOKIE = "chezcar-admin-location-scope";
const BRANCH_CODES = new Set(["QC", "BL", "LU", "VC", "SP"]);

type ShellLocation = {
  id: string;
  code: string;
  name: string;
  type: LocationType;
  isActive: boolean;
};

function readCookie(headers: Headers, name: string): string | null {
  const cookieHeader = headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1 || pair.slice(0, separator).trim() !== name) {
      continue;
    }

    try {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

function locationLabel(location: ShellLocation): string {
  return `${location.name} (${location.code})`;
}

function isCanonicalLocation(location: ShellLocation): boolean {
  return (
    location.isActive &&
    ((location.code === "SR" && location.type === "WAREHOUSE") ||
      (BRANCH_CODES.has(location.code) && location.type === "BRANCH"))
  );
}

async function adminScope(headers: Headers): Promise<LocationScopeDto> {
  const selectedLocationId = readCookie(
    headers,
    ADMIN_LOCATION_SCOPE_COOKIE,
  );

  if (!selectedLocationId) {
    return {
      kind: "all-locations",
      label: "All locations",
      locationId: null,
      code: null,
    };
  }

  const location = await prisma.location.findUnique({
    where: { id: selectedLocationId, isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      isActive: true,
    },
  });

  // The cookie persists presentation preference only. An untrusted or stale value
  // never enters capability evaluation and falls back to Admin's persisted scope.
  if (!location || !isCanonicalLocation(location)) {
    return {
      kind: "all-locations",
      label: "All locations",
      locationId: null,
      code: null,
    };
  }

  return {
    kind: "location",
    label: locationLabel(location),
    locationId: location.id,
    code: location.code,
  };
}

async function scopeFor(
  headers: Headers,
  context: PersistedAccessContext,
  location: ShellLocation | null,
): Promise<LocationScopeDto> {
  switch (context.role) {
    case "ADMIN":
      return adminScope(headers);
    case "STOCK_STAFF":
      return {
        kind: "location",
        label: "Stock Room (SR)",
        locationId: context.locationId,
        code: "SR",
      };
    case "BRANCH_STAFF":
      return {
        kind: "location",
        label: locationLabel(location as ShellLocation),
        locationId: context.locationId,
        code: location?.code ?? null,
      };
    case "ACCOUNTING_STAFF":
      return {
        kind: "business-wide",
        label: "Business-wide",
        locationId: null,
        code: null,
      };
  }
}

export async function loadShellAccess(headers: Headers): Promise<ShellAccessDto> {
  const session = await auth.api.getSession({ headers });

  if (!session) {
    return ANONYMOUS_SHELL_ACCESS;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      locationId: true,
      location: {
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          isActive: true,
        },
      },
    },
  });

  if (!user || user.status !== "ACTIVE") {
    return ANONYMOUS_SHELL_ACCESS;
  }

  const context: PersistedAccessContext = {
    userId: user.id,
    role: user.role,
    locationId: user.locationId,
    location: user.location,
  };

  if (!validatePersistedAssignment(context)) {
    return ANONYMOUS_SHELL_ACCESS;
  }

  const capabilities = capabilitiesFor(context);
  const permittedCapabilities = new Set(capabilities);
  const menu: ShellMenuEntryDto[] = menus
    .filter((item) => permittedCapabilities.has(item.capability))
    .map(({ label, href, iconId }) => ({ label, href, icon: iconId }));

  return {
    authenticated: true,
    identity: {
      name: user.name,
      email: user.email,
      role: user.role,
    },
    scope: await scopeFor(headers, context, user.location),
    capabilities,
    menu,
  };
}
