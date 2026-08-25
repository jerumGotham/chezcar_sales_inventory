import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, createAccessControl } from "better-auth/plugins";

import { prisma } from "@/lib/server/prisma";

/**
 * Internal Better Auth credential mechanism.
 *
 * This module exposes the pinned Better Auth 1.6.23 Admin-plugin
 * `createUser` / `setUserPassword` primitives to trusted server services
 * only. It must never be mounted through `toNextJsHandler`, re-exported
 * from client code, or used as a generic user-administration HTTP surface:
 * the public catch-all route keeps using the Admin-plugin-free `auth`
 * instance from `@/lib/server/auth`.
 */

const ACCESS_STATEMENTS = {
  user: [
    "create",
    "list",
    "set-role",
    "ban",
    "impersonate",
    "impersonate-admins",
    "delete",
    "set-password",
    "set-email",
    "get",
    "update",
  ],
  session: ["list", "revoke", "delete"],
} as const;

const internalAccessControl = createAccessControl(ACCESS_STATEMENTS);

const INTERNAL_ACCESS_ROLES = {
  ADMIN: internalAccessControl.newRole({
    user: [...ACCESS_STATEMENTS.user],
    session: [...ACCESS_STATEMENTS.session],
  }),
  STOCK_STAFF: internalAccessControl.newRole({ user: [], session: [] }),
  BRANCH_STAFF: internalAccessControl.newRole({ user: [], session: [] }),
  ACCOUNTING_STAFF: internalAccessControl.newRole({ user: [], session: [] }),
};

export const STAFF_CREATION_ROLES = [
  "STOCK_STAFF",
  "BRANCH_STAFF",
  "ACCOUNTING_STAFF",
] as const;

export type StaffRole = (typeof STAFF_CREATION_ROLES)[number];

function assertCreatableStaffRole(role: string): asserts role is StaffRole {
  if (!(STAFF_CREATION_ROLES as readonly string[]).includes(role)) {
    throw new Error(
      "Only Stock, Branch, and Accounting staff accounts may be created through the internal credential mechanism",
    );
  }
}

const internalCredentialEngine = betterAuth({
  appName: "Chezcar Sales & Inventory (internal credentials)",
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: ["ADMIN", "STOCK_STAFF", "BRANCH_STAFF", "ACCOUNTING_STAFF"],
        required: true,
        defaultValue: "BRANCH_STAFF",
        input: false,
      },
      status: {
        type: ["ACTIVE", "INACTIVE"],
        required: true,
        defaultValue: "ACTIVE",
        input: false,
      },
      locationId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  plugins: [
    admin({
      defaultRole: "BRANCH_STAFF",
      adminRoles: ["ADMIN"],
      roles: INTERNAL_ACCESS_ROLES,
    }),
  ],
});

type CreateStaffCredentialInput = {
  body: {
    email: string;
    password: string;
    name: string;
    role: StaffRole;
    /**
     * Persisted canonical Location id. Required by the database CHECK
     * constraint for Stock/Branch Staff and forbidden for Accounting Staff;
     * Plan 01-09 resolves and validates the exact D-13 assignment.
     */
    locationId?: string | null;
  };
};

type SetStaffCredentialInput = {
  body: {
    userId: string;
    newPassword: string;
  };
  headers: Headers;
};

async function createStaffCredential(input: CreateStaffCredentialInput) {
  const { email, password, name, role, locationId } = input.body;
  assertCreatableStaffRole(role);

  // Better Auth Admin-plugin createUser carries application additional fields
  // through its `data` record; top-level extras are stripped.
  return internalCredentialEngine.api.createUser({
    body: {
      email,
      password,
      name,
      role,
      ...(locationId === undefined ? {} : { data: { locationId } }),
    },
  });
}

async function setStaffCredential(input: SetStaffCredentialInput) {
  if (!(input.headers instanceof Headers)) {
    throw new Error(
      "Owner Admin request headers are required to authorize internal credential resets",
    );
  }

  // The reset path serves non-Admin staff lifecycle only; the owner Admin
  // manages its own credential through authenticated self-service flows.
  const target = await prisma.user.findUnique({
    where: { id: input.body.userId },
    select: { id: true, role: true },
  });
  if (!target || target.role === "ADMIN") {
    throw new Error(
      "Only existing non-Admin staff accounts accept internal credential resets",
    );
  }

  return internalCredentialEngine.api.setUserPassword({
    body: input.body,
    headers: input.headers,
  });
}

/**
 * Server-only credential primitives for Chezcar user-lifecycle services.
 *
 * Narrowed on purpose: unlike a raw Better Auth instance, only the two
 * supported staff-credential operations are reachable, both guarded against
 * second-Admin creation and non-staff resets. Nothing here is routable —
 * the object is never handed to `toNextJsHandler` or client code.
 */
export const internalUserAuth = {
  api: {
    createUser: createStaffCredential,
    setUserPassword: setStaffCredential,
  },
};
