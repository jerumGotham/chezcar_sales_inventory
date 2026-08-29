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
  canAccessLocation,
  evaluateAccess,
  hasAllLocationAccess,
  type PersistedAccessContext,
  validatePersistedAssignment,
} from "./policy/access";
import {
  AuthenticationError,
  AuthorizationError,
  requireActiveUser,
  requireCapability,
} from "./authorization";
import { CAPABILITY_IDS } from "../contracts/roles";

function context(overrides: Partial<PersistedAccessContext> = {}): PersistedAccessContext {
  return {
    userId: "user-1",
    roleDefinitionId: "role-1",
    capabilities: ["inventory:view"],
    isOwner: false,
    locationIds: ["location-qc", "location-lu"],
    ...overrides,
  };
}

describe("persisted access policy", () => {
  it("fails closed for a restricted user without an active assignment", () => {
    const actor = context({ locationIds: [] });
    expect(validatePersistedAssignment(actor)).toBe(false);
    expect(evaluateAccess(actor, "inventory:view")).toBe(false);
  });

  it("authorizes every explicitly assigned location and no others", () => {
    const actor = context();
    expect(canAccessLocation(actor, "location-qc")).toBe(true);
    expect(canAccessLocation(actor, "location-lu")).toBe(true);
    expect(canAccessLocation(actor, "location-cebu")).toBe(false);
  });

  it("treats locations:all as location access only", () => {
    const actor = context({ capabilities: ["locations:all"], locationIds: [] });
    expect(hasAllLocationAccess(actor)).toBe(true);
    expect(canAccessLocation(actor, "location-anywhere")).toBe(true);
    expect(evaluateAccess(actor, "inventory:view")).toBe(false);
  });

  it("gives the explicit owner singleton all capabilities and locations", () => {
    const actor = context({ isOwner: true, capabilities: [], locationIds: [] });
    expect(evaluateAccess(actor, "roles:update")).toBe(true);
    expect(canAccessLocation(actor, "location-anywhere")).toBe(true);
  });
});

function persistedUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "persisted-user",
    status: "ACTIVE",
    roleDefinitionId: "custom-role",
    accessRole: { isOwner: false, permissions: ["inventory:view"] },
    locationAssignments: [{ locationId: "location-qc" }],
    ...overrides,
  };
}

describe("central authorization loader", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.findUnique.mockReset();
  });

  it("rejects a missing session before loading a user", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(requireActiveUser(new Headers())).rejects.toThrow(AuthenticationError);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["inactive", persistedUser({ status: "INACTIVE" })],
  ])("rejects a %s persisted user", async (_case, user) => {
    mocks.getSession.mockResolvedValue({ user: { id: "persisted-user" } });
    mocks.findUnique.mockResolvedValue(user);
    await expect(requireActiveUser(new Headers())).rejects.toThrow(AuthenticationError);
  });

  it("reloads persisted custom-role grants and assignments instead of forged session fields", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "persisted-user", role: "ADMIN", locationId: "forged-location" },
    });
    mocks.findUnique.mockResolvedValue(persistedUser());

    await expect(requireCapability(new Headers(), "inventory:view")).resolves.toEqual({
      userId: "persisted-user",
      roleDefinitionId: "custom-role",
      capabilities: ["inventory:view"],
      isOwner: false,
      locationIds: ["location-qc"],
    });
  });

  it("loads an active custom role without requiring a resource capability", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "persisted-user" } });
    mocks.findUnique.mockResolvedValue(
      persistedUser({ accessRole: { isOwner: false, permissions: [] } }),
    );
    await expect(requireActiveUser(new Headers())).resolves.toMatchObject({
      roleDefinitionId: "custom-role",
      capabilities: [],
    });
  });

  it("rejects an active persisted user without the requested capability", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "persisted-user" } });
    mocks.findUnique.mockResolvedValue(persistedUser());
    await expect(requireCapability(new Headers(), "roles:update")).rejects.toThrow(
      AuthorizationError,
    );
  });

  it("expands the explicit owner to the complete catalog", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "persisted-user" } });
    mocks.findUnique.mockResolvedValue(
      persistedUser({
        roleDefinitionId: "role-admin",
        accessRole: { isOwner: true, permissions: [] },
        locationAssignments: [],
      }),
    );
    await expect(requireActiveUser(new Headers())).resolves.toMatchObject({
      isOwner: true,
      capabilities: CAPABILITY_IDS,
    });
  });

  it("fails closed when a restricted persisted user has no active assignment", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "persisted-user" } });
    mocks.findUnique.mockResolvedValue(persistedUser({ locationAssignments: [] }));
    await expect(requireActiveUser(new Headers())).rejects.toThrow(AuthorizationError);
  });
});
