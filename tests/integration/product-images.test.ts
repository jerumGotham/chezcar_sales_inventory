import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

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

import { prisma as sharedPrisma } from "../../lib/server/prisma";
import { withDisposableDatabase } from "../helpers/database";
import { authContextFor, createAuthFixture } from "../helpers/factories";

describe("product images", () => {
  let storagePath: string | undefined;

  afterEach(async () => {
    await sharedPrisma.$disconnect();
    delete process.env.PRODUCT_IMAGE_STORAGE_PATH;
    if (storagePath) await rm(storagePath, { recursive: true, force: true });
    storagePath = undefined;
  });

  it("uploads, serves, replaces, lists, removes, and authorizes product images", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      storagePath = await mkdtemp(path.join(tmpdir(), "chezcar-product-images-"));
      process.env.PRODUCT_IMAGE_STORAGE_PATH = storagePath;
      const fixture = await createAuthFixture(prisma, {
        namespace: "product-images",
      });
      const product = await prisma.product.create({
        data: {
          itemCode: "IMAGE-ITEM",
          name: "Image Item",
          price: 100,
        },
      });
      const admin = authContextFor(fixture.users.admin, null);
      const stock = authContextFor(
        fixture.users.stockStaff,
        fixture.locations.stockRoom,
      );
      const {
        ProductImageError,
        readProductImage,
        removeProductImage,
        uploadProductImage,
      } = await import("../../lib/server/services/product-images");
      const { listProducts, productListQuerySchema } = await import(
        "../../lib/server/catalog"
      );
      const imageRoute = await import(
        "../../app/api/products/[productId]/image/route"
      );

      const png = new Blob(
        [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
        { type: "image/png" },
      );
      const uploaded = await uploadProductImage(admin, product.id, png);
      expect(uploaded.imageUrl).toMatch(
        new RegExp(`^/api/products/${product.id}/image\\?v=\\d+$`),
      );
      const storedPng = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      expect(storedPng).toMatchObject({ imageType: "image/png" });
      expect(storedPng.imageKey).toMatch(/\.png$/);
      await expect(readProductImage(product.id)).resolves.toMatchObject({
        contentType: "image/png",
        body: expect.any(Uint8Array),
      });

      const listed = await listProducts(
        productListQuerySchema.parse({ itemCode: "IMAGE-ITEM" }),
      );
      expect(listed.data).toHaveLength(1);
      expect(listed.data[0]?.imageUrl).toBe(uploaded.imageUrl);

      authMocks.getSession.mockResolvedValue({
        user: { id: fixture.users.stockStaff.id },
      });
      const context = { params: Promise.resolve({ productId: product.id }) };
      const readResponse = await imageRoute.GET(
        new Request(`http://localhost:3000/api/products/${product.id}/image`),
        context,
      );
      expect(readResponse.status).toBe(200);
      expect(readResponse.headers.get("Content-Type")).toBe("image/png");

      const deniedUploadForm = new FormData();
      deniedUploadForm.set("image", png, "product.png");
      const deniedUploadResponse = await imageRoute.POST(
        new Request(`http://localhost:3000/api/products/${product.id}/image`, {
          method: "POST",
          body: deniedUploadForm,
        }),
        context,
      );
      expect(deniedUploadResponse.status).toBe(403);

      const deniedDeleteResponse = await imageRoute.DELETE(
        new Request(`http://localhost:3000/api/products/${product.id}/image`, {
          method: "DELETE",
        }),
        context,
      );
      expect(deniedDeleteResponse.status).toBe(403);

      await expect(uploadProductImage(stock, product.id, png)).rejects.toBeInstanceOf(
        ProductImageError,
      );

      const jpeg = new Blob(
        [Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])],
        { type: "image/jpeg" },
      );
      await uploadProductImage(admin, product.id, jpeg);
      const filesAfterReplace = await readdir(storagePath);
      expect(filesAfterReplace).toHaveLength(1);
      expect(filesAfterReplace[0]).toMatch(/\.jpg$/);
      expect(filesAfterReplace[0]).not.toBe(storedPng.imageKey);

      await removeProductImage(admin, product.id);
      await expect(readdir(storagePath)).resolves.toEqual([]);
      await expect(readProductImage(product.id)).rejects.toMatchObject({
        code: "NOT_FOUND",
        status: 404,
      });

      const invalid = new Blob([Uint8Array.from([1, 2, 3])], {
        type: "image/png",
      });
      await expect(uploadProductImage(admin, product.id, invalid)).rejects.toMatchObject({
        code: "INVALID_IMAGE",
        status: 400,
      });

      const tooLarge = new Blob([new Uint8Array(6 * 1024 * 1024 + 1)], {
        type: "image/png",
      });
      await expect(uploadProductImage(admin, product.id, tooLarge)).rejects.toMatchObject({
        code: "INVALID_IMAGE",
        status: 400,
      });

      await uploadProductImage(admin, product.id, png);
      const { deleteProduct } = await import("../../lib/server/catalog");
      await deleteProduct(admin, product.id);
      await expect(readdir(storagePath)).resolves.toEqual([]);
    });
  }, 60_000);
});
