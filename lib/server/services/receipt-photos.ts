import "server-only";

import { assertCapability, type AuthContext } from "@/lib/server/authorization";
import { canAccessLocation, evaluateAccess } from "@/lib/server/policy/access";
import { prisma } from "@/lib/server/prisma";
import { recordAuditLog } from "@/lib/server/services/audit-log";
import { readReceiptEvidence, removeReceiptEvidence, saveReceiptEvidence } from "@/lib/server/services/receipt-evidence";

/** Every picture of one receipt, the first included. */
export const MAX_RECEIPT_PHOTOS = 5;

export class ReceiptPhotoError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
  ) {
    super(message);
  }
}

export type ReceiptPhotoOwner =
  | { kind: "payment"; id: string }
  | { kind: "sale"; id: string }
  | { kind: "transfer"; id: string }
  | { kind: "stockReceipt"; id: string };

export function receiptPhotoUrl(photoId: string) {
  return `/api/receipt-photos/${encodeURIComponent(photoId)}`;
}

/*
 * Who may add to a receipt, and how many pictures it already has. A payment
 * or a sale keeps its first photo on its own row, which verification reads, so
 * the extras follow it: the first must be there before a second is added, and
 * once the receipt is verified its pictures are settled.
 */
async function resolveOwner(actor: AuthContext, owner: ReceiptPhotoOwner) {
  if (owner.kind === "payment") {
    assertCapability(actor, "sales:evidence:upload");
    const payment = await prisma.payment.findUnique({
      where: { id: owner.id },
      select: { id: true, locationId: true, saleId: true, status: true, reviewStatus: true, resolvedAt: true, receiptPhotoKey: true, receiptNumber: true, _count: { select: { extraPhotos: true } } },
    });
    if (!payment) throw new ReceiptPhotoError("NOT_FOUND", "Payment not found", 404);
    if (!canAccessLocation(actor, payment.locationId)) throw new ReceiptPhotoError("FORBIDDEN", "That receipt is outside your assigned branches", 403);
    if (payment.saleId) throw new ReceiptPhotoError("INVALID_STATE", "This receipt is evidenced with its sale");
    if (payment.status !== "ACTIVE") throw new ReceiptPhotoError("INVALID_STATE", "A voided receipt cannot take new photos");
    if (payment.reviewStatus === "VERIFIED" || payment.resolvedAt) throw new ReceiptPhotoError("INVALID_STATE", "The receipt photos cannot be changed after review");
    if (!payment.receiptPhotoKey) throw new ReceiptPhotoError("PRIMARY_REQUIRED", "Attach the first receipt photo before adding more");
    return { link: { paymentId: payment.id }, count: 1 + payment._count.extraPhotos, reference: payment.receiptNumber };
  }
  if (owner.kind === "sale") {
    assertCapability(actor, "sales:evidence:upload");
    const sale = await prisma.sale.findUnique({
      where: { id: owner.id },
      select: { status: true, locationId: true, manualReceiptNumber: true, accountingReview: { select: { id: true, status: true, resolvedAt: true, receiptPhotoKey: true, _count: { select: { extraPhotos: true } } } } },
    });
    if (!sale?.accountingReview) throw new ReceiptPhotoError("NOT_FOUND", "Sale not found", 404);
    if (!canAccessLocation(actor, sale.locationId)) throw new ReceiptPhotoError("FORBIDDEN", "That receipt is outside your assigned branches", 403);
    if (sale.status !== "POSTED") throw new ReceiptPhotoError("INVALID_STATE", "Only a posted sale can take new photos");
    const review = sale.accountingReview;
    if (review.status === "VERIFIED" || review.resolvedAt) throw new ReceiptPhotoError("INVALID_STATE", "The receipt photos cannot be changed after review");
    if (!review.receiptPhotoKey) throw new ReceiptPhotoError("PRIMARY_REQUIRED", "Attach the first receipt photo before adding more");
    return { link: { saleReviewId: review.id }, count: 1 + review._count.extraPhotos, reference: sale.manualReceiptNumber };
  }
  if (owner.kind === "stockReceipt") {
    // Whoever receives deliveries photographs the supplier's receipt. Posted
    // stock receipts have no review to settle, so photos can follow later.
    assertCapability(actor, "inventory-receiving:create");
    const receipt = await prisma.stockReceipt.findUnique({
      where: { id: owner.id },
      select: { id: true, locationId: true, reference: true, _count: { select: { receiptPhotos: true } } },
    });
    if (!receipt) throw new ReceiptPhotoError("NOT_FOUND", "Supplier receipt not found", 404);
    if (!canAccessLocation(actor, receipt.locationId)) throw new ReceiptPhotoError("FORBIDDEN", "That receipt is outside your assigned locations", 403);
    return { link: { stockReceiptId: receipt.id }, count: receipt._count.receiptPhotos, reference: receipt.reference };
  }
  assertCapability(actor, "stock-transfers:dispatch");
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id: owner.id },
    select: { id: true, sourceId: true, status: true, reference: true, _count: { select: { receiptPhotos: true } } },
  });
  if (!transfer) throw new ReceiptPhotoError("NOT_FOUND", "Transfer not found", 404);
  // The sending side photographs what it sent, while the goods are on the road.
  if (!canAccessLocation(actor, transfer.sourceId)) throw new ReceiptPhotoError("FORBIDDEN", "That transfer is outside your assigned locations", 403);
  if (transfer.status !== "IN_TRANSIT") throw new ReceiptPhotoError("INVALID_STATE", "Receipt photos are added while the transfer is in transit");
  return { link: { transferId: transfer.id }, count: transfer._count.receiptPhotos, reference: transfer.reference };
}

export async function addReceiptPhotos(actor: AuthContext, owner: ReceiptPhotoOwner, files: File[]) {
  if (files.length === 0) throw new ReceiptPhotoError("INVALID_INPUT", "Choose at least one photo", 400);
  const target = await resolveOwner(actor, owner);
  if (target.count + files.length > MAX_RECEIPT_PHOTOS) {
    throw new ReceiptPhotoError("TOO_MANY_PHOTOS", `A receipt takes up to ${MAX_RECEIPT_PHOTOS} photos; this one already has ${target.count}`, 400);
  }

  const saved: Array<{ key: string; contentType: string }> = [];
  try {
    for (const file of files) saved.push(await saveReceiptEvidence(file));
    const rows = await prisma.$transaction(saved.map((evidence) =>
      prisma.receiptPhoto.create({
        data: { ...target.link, key: evidence.key, contentType: evidence.contentType, uploadedById: actor.userId },
        select: { id: true },
      })));
    await recordAuditLog({
      category: owner.kind === "transfer" ? "Stock Transfers" : owner.kind === "stockReceipt" ? "Inventory" : "Receipt Verification",
      action: "Receipt Photos Added",
      actorId: actor.userId,
      reference: target.reference,
      details: `${rows.length} more photo(s) attached to ${target.reference}`,
    });
    return rows.map((row) => ({ id: row.id, url: receiptPhotoUrl(row.id) }));
  } catch (error) {
    // Nothing points at a file whose row was never written.
    await Promise.all(saved.map((evidence) => removeReceiptEvidence(evidence.key).catch(() => {})));
    if (error instanceof Error && error.message.startsWith("Receipt evidence")) {
      throw new ReceiptPhotoError("INVALID_INPUT", error.message, 400);
    }
    throw error;
  }
}

async function loadPhoto(photoId: string) {
  const photo = await prisma.receiptPhoto.findUnique({
    where: { id: photoId },
    select: {
      id: true,
      key: true,
      payment: { select: { locationId: true, reviewStatus: true, reviewedAt: true, resolvedAt: true, receiptNumber: true } },
      saleReview: { select: { status: true, reviewedAt: true, resolvedAt: true, sale: { select: { locationId: true, manualReceiptNumber: true } } } },
      transfer: { select: { sourceId: true, destinationId: true, status: true, reference: true } },
      stockReceipt: { select: { locationId: true, reference: true } },
    },
  });
  if (!photo) throw new ReceiptPhotoError("NOT_FOUND", "Photo not found", 404);
  return photo;
}

/** The image itself, to whoever may see that receipt. */
export async function readReceiptPhoto(actor: AuthContext, photoId: string) {
  const photo = await loadPhoto(photoId);
  if (photo.stockReceipt) {
    if (!evaluateAccess(actor, "stock-receipts:view") && !evaluateAccess(actor, "inventory-receiving:create")) {
      throw new ReceiptPhotoError("FORBIDDEN", "Insufficient permissions", 403);
    }
    if (!canAccessLocation(actor, photo.stockReceipt.locationId)) throw new ReceiptPhotoError("FORBIDDEN", "That receipt is outside your assigned locations", 403);
  } else if (photo.transfer) {
    assertCapability(actor, "stock-transfers:view");
    if (!canAccessLocation(actor, photo.transfer.sourceId) && !canAccessLocation(actor, photo.transfer.destinationId)) {
      throw new ReceiptPhotoError("FORBIDDEN", "That transfer is outside your assigned locations", 403);
    }
  } else {
    assertCapability(actor, "sales:evidence:view");
    const locationId = photo.payment?.locationId ?? photo.saleReview?.sale.locationId ?? "";
    if (!canAccessLocation(actor, locationId)) throw new ReceiptPhotoError("FORBIDDEN", "That receipt is outside your assigned branches", 403);
  }
  return readReceiptEvidence(photo.key);
}

/** Removes one extra photo while the receipt is still open to change. */
export async function deleteReceiptPhoto(actor: AuthContext, photoId: string) {
  const photo = await loadPhoto(photoId);
  let reference: string;
  if (photo.stockReceipt) {
    assertCapability(actor, "inventory-receiving:create");
    if (!canAccessLocation(actor, photo.stockReceipt.locationId)) throw new ReceiptPhotoError("FORBIDDEN", "That receipt is outside your assigned locations", 403);
    reference = photo.stockReceipt.reference;
  } else if (photo.transfer) {
    assertCapability(actor, "stock-transfers:dispatch");
    if (!canAccessLocation(actor, photo.transfer.sourceId)) throw new ReceiptPhotoError("FORBIDDEN", "That transfer is outside your assigned locations", 403);
    if (photo.transfer.status !== "IN_TRANSIT") throw new ReceiptPhotoError("INVALID_STATE", "Receipt photos can be removed only while the transfer is in transit");
    reference = photo.transfer.reference;
  } else {
    assertCapability(actor, "sales:evidence:delete");
    const review = photo.payment ?? photo.saleReview!;
    const locationId = photo.payment?.locationId ?? photo.saleReview!.sale.locationId;
    if (!canAccessLocation(actor, locationId)) throw new ReceiptPhotoError("FORBIDDEN", "That receipt is outside your assigned branches", 403);
    const status = photo.payment?.reviewStatus ?? photo.saleReview!.status;
    if (status !== "UNVERIFIED" || review.reviewedAt || review.resolvedAt) {
      throw new ReceiptPhotoError("INVALID_STATE", "The receipt photos cannot be changed after review");
    }
    reference = photo.payment?.receiptNumber ?? photo.saleReview!.sale.manualReceiptNumber;
  }
  await prisma.receiptPhoto.delete({ where: { id: photo.id } });
  await removeReceiptEvidence(photo.key).catch((error) => console.error("Unable to remove deleted receipt photo", error));
  await recordAuditLog({
    category: photo.transfer ? "Stock Transfers" : photo.stockReceipt ? "Inventory" : "Receipt Verification",
    action: "Receipt Photo Removed",
    actorId: actor.userId,
    reference,
    details: `A photo was removed from ${reference}`,
  });
  return { deleted: true };
}
