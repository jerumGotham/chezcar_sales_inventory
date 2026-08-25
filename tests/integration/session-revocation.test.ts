import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));
vi.mock("@/lib/server/auth", async () => import("../../lib/server/auth"));
vi.mock("@/lib/server/policy/access", async () =>
  import("../../lib/server/policy/access"),
);
vi.mock("@/lib/server/authorization", async () =>
  import("../../lib/server/authorization"),
);
vi.mock("@/lib/server/internal-user-auth", async () =>
  import("../../lib/server/internal-user-auth"),
);
vi.mock("@/lib/server/services/users", async () =>
  import("../../lib/server/services/users"),
);
vi.mock("@/lib/contracts/users", async () => import("../../lib/contracts/users"));
vi.mock("@/lib/catalog", async () => import("../../lib/catalog"));
vi.mock("@/lib/server/catalog", async () => import("../../lib/server/catalog"));

import { auth } from "../../lib/server/auth";
import { prisma as sharedPrisma } from "../../lib/server/prisma";
import { withDisposableDatabase } from "../helpers/database";
import { createAuthFixture, createLocationFixtures } from "../helpers/factories";

const OWNER_EMAIL = "owner-admin@auth-fixture.example.test";
const OWNER_PASSWORD = "Owner-Temp-Pass-1";
const STAFF_PASSWORD = "Revocation-Pass-1";

async function grantCredential(
  prisma: PrismaClient,
  userId: string,
  password: string,
) {
  const authContext = await auth.$context;
  const passwordHash = await authContext.password.hash(password);
  await prisma.account.create({
    data: {
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
    },
  });
}

async function signIn(prisma: PrismaClient, email: string, password: string) {
  const response = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  const sessionCookie = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("better-auth.session_token="));
  expect(sessionCookie).toBeDefined();
  return sessionCookie ?? "";
}

async function prepareOwner(prisma: PrismaClient) {
  const fixture = await createAuthFixture(prisma, {
    namespace: "revocation-owner",
  });
  await grantCredential(prisma, fixture.users.admin.id, OWNER_PASSWORD);
  const ownerCookie = await signIn(prisma, OWNER_EMAIL, OWNER_PASSWORD);
  return {
    fixture,
    ownerHeaders: new Headers({ cookie: ownerCookie }),
  };
}

function routeContext(userId: string) {
  return { params: Promise.resolve({ userId }) };
}

describe("access change and session revocation atomicity", () => {
  afterEach(async () => {
    await sharedPrisma.$disconnect();
  });

  it("deletes every existing target session atomically and rejects old cookies immediately", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const { fixture, ownerHeaders } = await prepareOwner(prisma);
      await createLocationFixtures(prisma);
      const target = fixture.users.branchStaff;
      await grantCredential(prisma, target.id, STAFF_PASSWORD);
      const oldCookies = [
        await signIn(prisma, target.email, STAFF_PASSWORD),
        await signIn(prisma, target.email, STAFF_PASSWORD),
      ];
      const sessionsBefore = await prisma.session.count({
        where: { userId: target.id },
      });
      expect(sessionsBefore).toBeGreaterThanOrEqual(2);

      const { POST: postStatus } = await import(
        "../../app/api/users/[userId]/status/route"
      );
      const deactivation = await postStatus(
        new Request(`http://localhost/api/users/${target.id}/status`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: ownerHeaders.get("cookie") ?? "" },
          body: JSON.stringify({ status: "INACTIVE" }),
        }),
        routeContext(target.id),
      );
      expect(deactivation.status).toBe(200);
      expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);

      // Every old cookie receives 401 immediately through a protected route.
      const { GET: getProducts } = await import("../../app/api/products/route");
      for (const cookie of oldCookies) {
        const response = await getProducts(
          new Request("http://localhost/api/products?page=1", {
            headers: { cookie },
          }),
        );
        expect(response.status).toBe(401);
        const body = (await response.json()) as {
          error?: { code?: string };
          data?: unknown;
        };
        expect(body.error?.code).toBe("UNAUTHENTICATED");
        expect(body.data).toBeUndefined();
      }
    });
  }, 120_000);

  it("rolls back access state and session deletion together on forced failure", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const { fixture, ownerHeaders } = await prepareOwner(prisma);
      await createLocationFixtures(prisma);
      const target = fixture.users.branchStaff;
      await grantCredential(prisma, target.id, STAFF_PASSWORD);
      await signIn(prisma, target.email, STAFF_PASSWORD);
      await signIn(prisma, target.email, STAFF_PASSWORD);

      const service = await import("../../lib/server/services/users");
      const actor = await service.requireOwnerAdmin(ownerHeaders);

      const sessionsBefore = await prisma.session.count({
        where: { userId: target.id },
      });

      await expect(
        service.setStaffStatus(actor, target.id, "INACTIVE", {
          injectFailureAfterAccessWrite: true,
        }),
      ).rejects.toThrow(/Injected access-change failure/);

      let reloaded = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
        include: { location: true },
      });
      expect(reloaded.status).toBe("ACTIVE");
      expect(await prisma.session.count({ where: { userId: target.id } })).toBe(
        sessionsBefore,
      );

      await expect(
        service.updateStaffUser(
          actor,
          target.id,
          { role: "ACCOUNTING_STAFF" },
          { injectFailureAfterAccessWrite: true },
        ),
      ).rejects.toThrow(/Injected access-change failure/);

      reloaded = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
        include: { location: true },
      });
      expect(reloaded.role).toBe("BRANCH_STAFF");
      expect(reloaded.status).toBe("ACTIVE");
      expect(reloaded.location?.code).toBe("QC");
      expect(await prisma.session.count({ where: { userId: target.id } })).toBe(
        sessionsBefore,
      );
    });
  }, 120_000);

  it("serializes concurrent access changes to one valid final assignment with no surviving pre-change session", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const { fixture, ownerHeaders } = await prepareOwner(prisma);
      const locations = await createLocationFixtures(prisma);
      const target = fixture.users.branchStaff;
      await grantCredential(prisma, target.id, STAFF_PASSWORD);
      const preChangeCookie = await signIn(
        prisma,
        target.email,
        STAFF_PASSWORD,
      );

      const service = await import("../../lib/server/services/users");
      const actor = await service.requireOwnerAdmin(ownerHeaders);

      // Concurrent deactivation and role change must serialize into one valid
      // final assignment without leaving the pre-change session alive.
      const outcomes = await Promise.allSettled([
        service.setStaffStatus(actor, target.id, "INACTIVE"),
        service.updateStaffUser(actor, target.id, {
          role: "ACCOUNTING_STAFF",
        }),
      ]);
      const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
      expect(rejected).toHaveLength(0);

      const finalState = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
        include: { location: true },
      });
      const { validatePersistedAssignment } = await import(
        "../../lib/server/policy/access"
      );
      if (finalState.status === "ACTIVE") {
        expect(
          validatePersistedAssignment({
            userId: finalState.id,
            role: finalState.role,
            locationId: finalState.locationId,
            location: finalState.location
              ? {
                  id: finalState.location.id,
                  code: finalState.location.code,
                  type: finalState.location.type,
                  isActive: finalState.location.isActive,
                }
              : null,
          }),
        ).toBe(true);
      }

      // Concurrent branch-to-branch moves land on exactly one active branch.
      // Each move states the complete intended assignment so the scenario is
      // independent of whichever role the serialized first pair produced.
      const moveOutcomes = await Promise.allSettled([
        service.updateStaffUser(actor, target.id, {
          role: "BRANCH_STAFF",
          locationId: locations.branches.BL.id,
        }),
        service.updateStaffUser(actor, target.id, {
          role: "BRANCH_STAFF",
          locationId: locations.branches.VC.id,
        }),
      ]);
      const settledMoves = moveOutcomes.map((outcome) =>
        outcome.status === "fulfilled" ? outcome.value.location?.code : "rejected",
      );
      expect(settledMoves.filter((code) => code === "rejected")).toHaveLength(0);

      const movedState = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
        include: { location: true },
      });
      // Serialized writes mean the final branch is whichever move committed
      // last; both candidate codes are individually valid final assignments.
      expect(movedState.role).toBe("BRANCH_STAFF");
      expect(["BL", "VC"]).toContain(movedState.location?.code);

      expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);
      const survivingPreChange = await prisma.session.findFirst({
        where: { token: preChangeCookie },
      });
      expect(survivingPreChange).toBeNull();
    });
  }, 120_000);

  it("gives the wrong newly persisted scope a data-free 403 after re-authentication", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const { fixture, ownerHeaders } = await prepareOwner(prisma);
      await createLocationFixtures(prisma);
      const target = fixture.users.branchStaff;
      await grantCredential(prisma, target.id, STAFF_PASSWORD);
      const oldScopeCookie = await signIn(prisma, target.email, STAFF_PASSWORD);

      const service = await import("../../lib/server/services/users");
      const actor = await service.requireOwnerAdmin(ownerHeaders);
      const changed = await service.updateStaffUser(actor, target.id, {
        role: "ACCOUNTING_STAFF",
      });
      expect(changed.role).toBe("ACCOUNTING_STAFF");

      const { GET: getProducts } = await import("../../app/api/products/route");
      const { GET: getInventory } = await import("../../app/api/inventory/route");

      // The pre-change cookie cannot even authenticate anymore.
      const staleResponse = await getProducts(
        new Request("http://localhost/api/products?page=1", {
          headers: { cookie: oldScopeCookie },
        }),
      );
      expect(staleResponse.status).toBe(401);

      // After signing back in, the persisted Accounting scope denies both
      // previously reachable reads with a data-free 403.
      const newScopeCookie = await signIn(prisma, target.email, STAFF_PASSWORD);
      const productsResponse = await getProducts(
        new Request("http://localhost/api/products?page=1", {
          headers: { cookie: newScopeCookie },
        }),
      );
      expect(productsResponse.status).toBe(403);
      const productsBody = (await productsResponse.json()) as {
        error?: { code?: string };
        data?: unknown;
      };
      expect(productsBody.error?.code).toBe("FORBIDDEN");
      expect(productsBody.data).toBeUndefined();

      const inventoryResponse = await getInventory(
        new Request("http://localhost/api/inventory?page=1&location=all", {
          headers: { cookie: newScopeCookie },
        }),
      );
      expect(inventoryResponse.status).toBe(403);
      const inventoryBody = (await inventoryResponse.json()) as {
        error?: { code?: string };
        data?: unknown;
      };
      expect(inventoryBody.error?.code).toBe("FORBIDDEN");
      expect(inventoryBody.data).toBeUndefined();
    });
  }, 120_000);

  it("keeps generic Admin operations unroutable while lifecycle APIs exist", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const { fixture } = await prepareOwner(prisma);
      const response = await auth.handler(
        new Request("http://localhost/api/auth/admin/set-role", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            userId: fixture.users.branchStaff.id,
            role: "ADMIN",
          }),
        }),
      );
      expect(response.status).toBe(404);
      expect(
        await prisma.user.count({ where: { role: "ADMIN" } }),
      ).toBe(1);
    });
  }, 120_000);
});
