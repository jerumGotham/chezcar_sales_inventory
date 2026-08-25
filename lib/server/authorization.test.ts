import type { LocationType, UserRole, UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("@/lib/server/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
}));

import {
  AuthenticationError,
  AuthorizationError,
  requireCapability,
} from "./authorization";
import {
  evaluateAccess,
  type PersistedAccessContext,
  validatePersistedAssignment,
} from "./policy/access";

type LocationInput = {
  id: string;
  code: string;
  type: LocationType;
  isActive: boolean;
};

const stockRoom: LocationInput = {
  id: "location-sr",
  code: "SR",
  type: "WAREHOUSE",
  isActive: true,
};
const branch: LocationInput = {
  id: "location-qc",
  code: "QC",
  type: "BRANCH",
  isActive: true,
};

function accessContext(
  role: UserRole,
  location: LocationInput | null,
): PersistedAccessContext {
  return {
    userId: `user-${role.toLowerCase()}`,
    role,
    locationId: location?.id ?? null,
    location,
  };
}

function persistedUser(
  role: UserRole,
  location: LocationInput | null,
  status: UserStatus = "ACTIVE",
) {
  return {
    id: `user-${role.toLowerCase()}`,
    role,
    status,
    locationId: location?.id ?? null,
    location,
  };
}

describe("fixed persisted access policy", () => {
  it.each([
    ["ADMIN", null],
    ["STOCK_STAFF", stockRoom],
    ["BRANCH_STAFF", branch],
    ["ACCOUNTING_STAFF", null],
  ] satisfies ReadonlyArray<readonly [UserRole, LocationInput | null]>)
  ("accepts the exact %s assignment", (role, location) => {
    expect(validatePersistedAssignment(accessContext(role, location))).toBe(true);
  });

  it.each([
    ["ADMIN", branch, "extra Admin location"],
    ["ACCOUNTING_STAFF", branch, "extra Accounting location"],
    ["STOCK_STAFF", null, "missing Stock Room"],
    ["STOCK_STAFF", branch, "branch assigned to Stock Staff"],
    [
      "STOCK_STAFF",
      { ...stockRoom, type: "BRANCH" },
      "SR with incompatible type",
    ],
    [
      "STOCK_STAFF",
      { ...stockRoom, isActive: false },
      "inactive Stock Room",
    ],
    ["BRANCH_STAFF", null, "missing branch"],
    ["BRANCH_STAFF", stockRoom, "Stock Room assigned to Branch Staff"],
    [
      "BRANCH_STAFF",
      { ...branch, isActive: false },
      "inactive branch",
    ],
    [
      "BRANCH_STAFF",
      { ...branch, code: "UNKNOWN" },
      "noncanonical branch",
    ],
  ] satisfies ReadonlyArray<
    readonly [UserRole, LocationInput | null, string]
  >)("rejects %s with %s", (role, location) => {
    expect(validatePersistedAssignment(accessContext(role, location))).toBe(false);
  });

  it.each([
    ["ADMIN", null, "users:manage", true],
    ["STOCK_STAFF", stockRoom, "products:view", true],
    ["BRANCH_STAFF", branch, "inventory:view", true],
    ["ACCOUNTING_STAFF", null, "inventory:view", false],
    ["BRANCH_STAFF", branch, "products:view", false],
  ] as const)(
    "evaluates %s and %s deterministically",
    (role, location, capability, expected) => {
      const context = accessContext(role, location);
      const decisions = [
        evaluateAccess(context, capability),
        evaluateAccess({ ...context }, capability),
        evaluateAccess(context, capability),
      ];

      expect(decisions).toEqual([expected, expected, expected]);
    },
  );

  it("fails closed before capability evaluation for an invalid assignment", () => {
    expect(evaluateAccess(accessContext("STOCK_STAFF", branch), "dashboard:view"))
      .toBe(false);
  });
});

describe("requireCapability", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.findUnique.mockReset();
  });

  it.each(["missing", "revoked"])(
    "returns authentication failure for a %s session",
    async () => {
      mocks.getSession.mockResolvedValue(null);

      await expect(
        requireCapability(new Headers(), "dashboard:view"),
      ).rejects.toThrow(AuthenticationError);
      expect(mocks.findUnique).not.toHaveBeenCalled();
    },
  );

  it("returns authentication failure when the persisted user is missing", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "deleted-user" } });
    mocks.findUnique.mockResolvedValue(null);

    await expect(
      requireCapability(new Headers(), "dashboard:view"),
    ).rejects.toThrow(AuthenticationError);
  });

  it("returns authentication failure when the persisted user is inactive", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "inactive-user" } });
    mocks.findUnique.mockResolvedValue(
      persistedUser("BRANCH_STAFF", branch, "INACTIVE"),
    );

    await expect(
      requireCapability(new Headers(), "dashboard:view"),
    ).rejects.toThrow(AuthenticationError);
  });

  it("returns authorization failure for a valid user without the capability", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "user-accounting_staff", role: "ADMIN", locationId: "forged" },
    });
    mocks.findUnique.mockResolvedValue(
      persistedUser("ACCOUNTING_STAFF", null),
    );

    await expect(
      requireCapability(new Headers(), "inventory:view"),
    ).rejects.toThrow(AuthorizationError);
  });

  it.each([
    ["ADMIN", branch],
    ["ACCOUNTING_STAFF", branch],
    ["STOCK_STAFF", null],
    ["STOCK_STAFF", branch],
    ["BRANCH_STAFF", null],
    ["BRANCH_STAFF", stockRoom],
    ["BRANCH_STAFF", { ...branch, isActive: false }],
  ] satisfies ReadonlyArray<readonly [UserRole, LocationInput | null]>)
  ("returns authorization failure for invalid %s scope", async (role, location) => {
    mocks.getSession.mockResolvedValue({ user: { id: `user-${role}` } });
    mocks.findUnique.mockResolvedValue(persistedUser(role, location));

    await expect(
      requireCapability(new Headers(), "dashboard:view"),
    ).rejects.toThrow(AuthorizationError);
  });

  it("returns only persisted active user and location context", async () => {
    mocks.getSession.mockResolvedValue({
      user: {
        id: "user-branch_staff",
        role: "ADMIN",
        locationId: stockRoom.id,
      },
    });
    mocks.findUnique.mockResolvedValue(persistedUser("BRANCH_STAFF", branch));

    await expect(
      requireCapability(new Headers(), "inventory:view"),
    ).resolves.toEqual(accessContext("BRANCH_STAFF", branch));
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: "user-branch_staff" },
      select: {
        id: true,
        role: true,
        status: true,
        locationId: true,
        location: {
          select: { id: true, code: true, type: true, isActive: true },
        },
      },
    });
  });
});
