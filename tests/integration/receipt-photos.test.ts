import { mkdtemp, readdir } from "node:fs/promises";
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

function jpeg(name: string) {
  // A JPEG signature is all the store checks.
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])], name, { type: "image/jpeg" });
}

describe("Receipts with more than one photo", () => {
  it("keeps up to five per receipt, needs the first before the rest, and serves them to who may see the receipt", async () => {
    const store = await mkdtemp(path.join(os.tmpdir(), "receipt-photos-"));
    process.env.RECEIPT_STORAGE_PATH = store;

    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "receipt-photos" });
      const branch = fixture.locations.branches.QC;
      const owner: AuthContext = authContextFor(fixture.users.admin, branch);
      const otherBranch: AuthContext = authContextFor(fixture.users.branchStaff, fixture.locations.branches.BL);

      const product = await prisma.product.create({ data: { itemCode: "RP-1", name: "Bumper", price: 1000, status: "ACTIVE" } });
      await prisma.inventoryBalance.create({ data: { locationId: branch.id, productId: product.id, onHand: 10, unitCost: 10 } });

      const { createDirectSale, getSaleById } = await import("../../lib/server/services/customer-sales");
      const { addReceiptPhotos, readReceiptPhoto, deleteReceiptPhoto } = await import("../../lib/server/services/receipt-photos");
      const sale = await createDirectSale(owner, {
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        manualReceiptNumber: "RP-OR-1",
        paymentMethod: "CASH",
        amountPaid: 1000,
        lines: [{ productId: product.id, quantity: 1 }],
      });

      // The first photo lives on the review; extras wait for it.
      await expect(addReceiptPhotos(owner, { kind: "sale", id: sale.id }, [jpeg("a.jpg")])).rejects.toMatchObject({ code: "PRIMARY_REQUIRED" });
      await prisma.saleAccountingReview.updateMany({ where: { saleId: sale.id }, data: { receiptPhotoKey: "11111111-1111-1111-1111-111111111111.jpg", receiptPhotoType: "image/jpeg" } });

      // Four more makes five; a sixth is refused.
      const added = await addReceiptPhotos(owner, { kind: "sale", id: sale.id }, [jpeg("b.jpg"), jpeg("c.jpg"), jpeg("d.jpg"), jpeg("e.jpg")]);
      expect(added).toHaveLength(4);
      await expect(addReceiptPhotos(owner, { kind: "sale", id: sale.id }, [jpeg("f.jpg")])).rejects.toMatchObject({ code: "TOO_MANY_PHOTOS" });
      expect(await readdir(store)).toHaveLength(4);

      // The sale reads them back after its first.
      const read = await getSaleById(owner, sale.id);
      expect((read as { extraPhotoUrls: string[] }).extraPhotoUrls).toEqual(added.map((photo) => photo.url));

      // Served to the branch's own reviewers, refused to another branch.
      await expect(readReceiptPhoto(owner, added[0].id)).resolves.toMatchObject({ contentType: "image/jpeg" });
      await expect(readReceiptPhoto(otherBranch, added[0].id)).rejects.toThrow();

      // An extra can be removed while unverified, file and all.
      await deleteReceiptPhoto(owner, added[3].id);
      expect(await prisma.receiptPhoto.count({ where: { saleReview: { saleId: sale.id } } })).toBe(3);
      expect(await readdir(store)).toHaveLength(3);

      // Once verified, the pictures are settled.
      await prisma.saleAccountingReview.updateMany({ where: { saleId: sale.id }, data: { status: "VERIFIED", verifiedAt: new Date() } });
      await expect(addReceiptPhotos(owner, { kind: "sale", id: sale.id }, [jpeg("g.jpg")])).rejects.toMatchObject({ code: "INVALID_STATE" });
      await expect(deleteReceiptPhoto(owner, added[0].id)).rejects.toMatchObject({ code: "INVALID_STATE" });

      // A transfer's delivery receipt: number at dispatch, photos while in transit.
      const { createTransfer, finalizeTransfer, dispatchTransfer, confirmReceipt } = await import("../../lib/server/services/stock-transfers");
      const sender: AuthContext = authContextFor(fixture.users.stockStaff, branch);
      const draft = await createTransfer(sender, { destinationId: fixture.locations.branches.BL.id, lines: [{ productId: product.id, quantity: 2 }] });
      const finalized = await finalizeTransfer(sender, draft.id, draft.version);
      await expect(addReceiptPhotos(sender, { kind: "transfer", id: draft.id }, [jpeg("t0.jpg")])).rejects.toMatchObject({ code: "INVALID_STATE" });
      const dispatched = await dispatchTransfer(sender, draft.id, finalized.version, "DR-555");
      expect(dispatched).toMatchObject({ status: "IN_TRANSIT", dispatchReceiptNumber: "DR-555" });
      const transferPhotos = await addReceiptPhotos(sender, { kind: "transfer", id: draft.id }, [jpeg("t1.jpg"), jpeg("t2.jpg")]);
      expect(transferPhotos).toHaveLength(2);

      const receiver: AuthContext = authContextFor(fixture.users.branchStaff, fixture.locations.branches.BL);
      // The receiving branch sees what was sent with the goods.
      await expect(readReceiptPhoto(receiver, transferPhotos[0].id)).resolves.toMatchObject({ contentType: "image/jpeg" });
      const received = await confirmReceipt(receiver, draft.id, dispatched.version);
      expect(received.receiptPhotoUrls).toHaveLength(2);
      // Once received, the receipt is closed.
      await expect(addReceiptPhotos(sender, { kind: "transfer", id: draft.id }, [jpeg("t3.jpg")])).rejects.toMatchObject({ code: "INVALID_STATE" });
    });
  }, 60_000);
});
