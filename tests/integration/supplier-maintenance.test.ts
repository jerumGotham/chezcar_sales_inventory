import type { AuthContext } from "@/lib/server/authorization";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { withDisposableDatabase } from "../helpers/database";
import { authContextFor, createAuthFixture } from "../helpers/factories";

const testEnvironment = vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
  return {};
});
void testEnvironment;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));

function actor(user: Parameters<typeof authContextFor>[0], location: Parameters<typeof authContextFor>[1]): AuthContext {
  return authContextFor(user, location);
}

describe("supplier maintenance", () => {
  it("creates, updates, deactivates, and reactivates a supplier without deleting history", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "supplier-maintenance" });
      const admin = actor(fixture.users.admin, null);
      const {
        createSupplier,
        listActiveSupplierOptionsForReceiving,
        listSuppliers,
        setSupplierStatus,
        updateSupplier,
      } = await import("../../lib/server/services/suppliers");

      const created = await createSupplier(admin, { code: " acme ", name: " Acme Trading " });
      expect(created).toMatchObject({ code: "ACME", name: "Acme Trading", status: "ACTIVE" });

      const updated = await updateSupplier(admin, created.id, { contactPerson: "Ana" });
      expect(updated.contactPerson).toBe("Ana");

      await setSupplierStatus(admin, created.id, { status: "INACTIVE" });
      await expect(listActiveSupplierOptionsForReceiving(actor(fixture.users.stockStaff, fixture.locations.stockRoom))).resolves.toEqual([]);
      await expect(listSuppliers(admin)).resolves.toMatchObject([{ id: created.id, status: "INACTIVE" }]);

      await setSupplierStatus(admin, created.id, { status: "ACTIVE" });
      await expect(listActiveSupplierOptionsForReceiving(actor(fixture.users.stockStaff, fixture.locations.stockRoom))).resolves.toMatchObject([{ id: created.id }]);
    });
  }, 30_000);

  it("rejects normalized duplicate names", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "supplier-duplicate" });
      const { createSupplier } = await import("../../lib/server/services/suppliers");
      const admin = actor(fixture.users.admin, null);
      await createSupplier(admin, { name: "Acme Trading" });
      await expect(createSupplier(admin, { name: "  ACME TRADING  " })).rejects.toMatchObject({ code: "SUPPLIER_NAME_IN_USE" });
    });
  }, 30_000);
});

afterEach(async () => {
  const { prisma } = await import("../../lib/server/prisma");
  await prisma.$disconnect();
});

afterAll(async () => {
  const { prisma } = await import("../../lib/server/prisma");
  await prisma.$disconnect();
});
