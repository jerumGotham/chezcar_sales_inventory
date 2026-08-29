import { afterAll, describe, expect, it, vi } from "vitest";

import { withDisposableDatabase } from "../helpers/database";
import { createAuthFixture } from "../helpers/factories";

const authMocks = vi.hoisted(() => {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
  return { getSession: vi.fn() };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/auth", () => ({
  auth: { api: { getSession: authMocks.getSession } },
}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));
vi.mock("@/lib/server/policy/access", async () =>
  import("../../lib/server/policy/access"),
);
vi.mock("@/lib/server/authorization", async () =>
  import("../../lib/server/authorization"),
);

describe("granular action permissions", () => {
  afterAll(async () => {
    const { prisma } = await import("../../lib/server/prisma");
    await prisma.$disconnect();
  });

  it("allows product add and implied view without allowing edit or delete", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, {
        namespace: "granular-product-add",
      });
      const role = await prisma.roleDefinition.create({
        data: {
          key: "granular-product-add",
          name: "Product Add Only",
          description: "Can add and view products without edit or delete access.",
          scope: "BRANCH",
          permissions: ["products:create"],
        },
      });
      await prisma.user.update({
        where: { id: fixture.users.branchStaff.id },
        data: { roleDefinitionId: role.id },
      });
      authMocks.getSession.mockResolvedValue({
        user: { id: fixture.users.branchStaff.id },
      });

      const collectionRoute = await import("../../app/api/products/route");
      const itemRoute = await import("../../app/api/products/[productId]/route");
      const createResponse = await collectionRoute.POST(
        new Request("http://localhost:3000/api/products", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            itemCode: "ADD-ONLY-001",
            name: "Add Only Product",
            price: 100,
            status: "ACTIVE",
            reorderLevel: 0,
          }),
        }),
      );
      expect(createResponse.status).toBe(201);
      const created = (await createResponse.json()) as { data: { id: string } };

      const listResponse = await collectionRoute.GET(
        new Request("http://localhost:3000/api/products?itemCode=ADD-ONLY-001"),
      );
      expect(listResponse.status).toBe(200);

      const context = { params: Promise.resolve({ productId: created.data.id }) };
      const editResponse = await itemRoute.PATCH(
        new Request(`http://localhost:3000/api/products/${created.data.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Forbidden Edit" }),
        }),
        context,
      );
      expect(editResponse.status).toBe(403);
      await expect(editResponse.json()).resolves.toEqual({
        error: { code: "FORBIDDEN", message: "Insufficient permissions" },
      });

      const deleteResponse = await itemRoute.DELETE(
        new Request(`http://localhost:3000/api/products/${created.data.id}`, {
          method: "DELETE",
        }),
        context,
      );
      expect(deleteResponse.status).toBe(403);
      expect(
        await prisma.product.findUnique({ where: { id: created.data.id } }),
      ).toMatchObject({ name: "Add Only Product" });
    });
  });
});
