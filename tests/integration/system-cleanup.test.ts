import { mkdtemp, readdir, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { AuthContext } from "@/lib/server/authorization";
import { describe, expect, it, vi } from "vitest";

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

const TWO_DAYS_AGO = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

async function upload(directory: string, name: string, old: boolean) {
  const file = path.join(directory, name);
  await writeFile(file, "x".repeat(100));
  if (old) await utimes(file, TWO_DAYS_AGO, TWO_DAYS_AGO);
}

describe("System cleanup", () => {
  it("clears only what nothing uses, leaves fresh uploads alone, and needs its own grant", async () => {
    const receipts = await mkdtemp(path.join(os.tmpdir(), "cleanup-receipts-"));
    const images = await mkdtemp(path.join(os.tmpdir(), "cleanup-images-"));
    const backups = await mkdtemp(path.join(os.tmpdir(), "cleanup-backups-"));
    process.env.RECEIPT_STORAGE_PATH = receipts;
    process.env.PRODUCT_IMAGE_STORAGE_PATH = images;
    process.env.BACKUP_STORAGE_PATH = backups;

    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "system-cleanup" });
      const branch = fixture.locations.branches.QC;
      const owner = actor(fixture.users.admin, branch);
      // The System console is the developer's alone, owner or not.
      const developer: AuthContext = { ...owner, isDeveloper: true };
      const branchStaff = actor(fixture.users.branchStaff, branch);

      const used = "11111111-1111-1111-1111-111111111111.jpg";
      const usedByPayment = "22222222-2222-2222-2222-222222222222.png";
      const orphan = "33333333-3333-3333-3333-333333333333.jpg";
      const fresh = "44444444-4444-4444-4444-444444444444.jpg";
      const usedAsExtra = "77777777-7777-7777-7777-777777777777.jpg";
      const usedImage = "55555555-5555-5555-5555-555555555555.webp";
      const orphanImage = "66666666-6666-6666-6666-666666666666.webp";
      for (const name of [used, usedByPayment, usedAsExtra, orphan]) await upload(receipts, name, true);
      // Written moments ago: its row may not be saved yet, so it is never an orphan.
      await upload(receipts, fresh, false);
      await upload(images, usedImage, true);
      await upload(images, orphanImage, true);
      // Not an upload key at all: never ours to judge.
      await upload(receipts, "notes.txt", true);
      for (const [index, name] of ["a.dump", "b.dump", "c.dump"].entries()) {
        await upload(backups, name, true);
        const at = new Date(Date.now() - (index + 1) * 60 * 60 * 1000);
        await utimes(path.join(backups, name), at, at);
      }

      const product = await prisma.product.create({ data: { itemCode: "CLEAN-1", name: "Winch", price: 100, status: "ACTIVE", imageKey: usedImage } });
      await prisma.inventoryBalance.create({ data: { locationId: branch.id, productId: product.id, onHand: 5, unitCost: 10 } });
      const { createDirectSale } = await import("../../lib/server/services/customer-sales");
      const sale = await createDirectSale(owner, {
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        manualReceiptNumber: "CLEAN-OR-1",
        paymentMethod: "CASH",
        amountPaid: 100,
        lines: [{ productId: product.id, quantity: 1 }],
      });
      await prisma.saleAccountingReview.updateMany({ where: { saleId: sale.id }, data: { receiptPhotoKey: used } });
      // A payment holds a photo too; borrowing this sale's row is enough to prove it is read.
      await prisma.payment.updateMany({ where: { saleId: sale.id }, data: { receiptPhotoKey: usedByPayment } });
      // A second photo of the same receipt is in use too.
      const review = await prisma.saleAccountingReview.findFirstOrThrow({ where: { saleId: sale.id } });
      await prisma.receiptPhoto.create({ data: { saleReviewId: review.id, key: usedAsExtra, contentType: "image/jpeg", uploadedById: fixture.users.admin.id } });

      await prisma.systemLog.create({ data: { level: "ERROR", source: "test", message: "old", occurredAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) } });
      await prisma.systemLog.create({ data: { level: "ERROR", source: "test", message: "recent" } });
      await prisma.session.create({ data: { token: "expired-token", userId: fixture.users.admin.id, expiresAt: TWO_DAYS_AGO } });

      const { scanCleanup, runCleanup } = await import("../../lib/server/services/system-cleanup");

      const scan = Object.fromEntries((await scanCleanup(developer)).map((item) => [item.task, item]));
      expect(scan["orphan-receipt-photos"].count).toBe(1);
      expect(scan["orphan-product-images"].count).toBe(1);
      expect(scan["old-backups"].count).toBe(1);
      expect(scan["old-system-logs"].count).toBe(1);
      expect(scan["expired-sessions"].count).toBeGreaterThanOrEqual(1);

      // Looking is monitoring; deleting is its own grant.
      await expect(runCleanup(branchStaff, ["orphan-receipt-photos"])).rejects.toThrow();
      await expect(runCleanup(owner, ["orphan-receipt-photos"])).rejects.toThrow();

      const result = await runCleanup(developer, ["orphan-receipt-photos", "orphan-product-images", "old-backups", "old-system-logs", "expired-sessions"]);
      expect(result.freedBytes).toBe(300);

      expect((await readdir(receipts)).sort()).toEqual([used, usedByPayment, usedAsExtra, fresh, "notes.txt"].sort());
      expect(await readdir(images)).toEqual([usedImage]);
      // The newest two backups stay.
      expect((await readdir(backups)).sort()).toEqual(["a.dump", "b.dump"]);
      expect((await prisma.systemLog.findMany({ select: { message: true } })).map((row) => row.message)).toEqual(["recent"]);
      expect(await prisma.session.count({ where: { token: "expired-token" } })).toBe(0);
      expect(await prisma.auditLog.count({ where: { action: "System Cleanup" } })).toBe(1);
    });
  });
});
