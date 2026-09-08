import "server-only";

import { Prisma } from "@prisma/client";

import type { CreateStockReceiptInput } from "@/lib/contracts/stock-receipts";
import {
  assertCapability,
  type AuthContext,
} from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { canAccessLocation, hasAllLocationAccess } from "@/lib/server/policy/access";

export class StockReceiptError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 409) {
    super(message);
  }
}

function serializeReceipt(receipt: {
  id: string;
  reference: string;
  supplierId: string;
  supplierName: string;
  supplier: { id: string; code: string | null; name: string };
  notes: string | null;
  receivedAt: Date;
  location: { id: string; code: string; name: string };
  lines: Array<{ quantity: number; acceptedQuantity: number; quarantinedQuantity: number; missingQuantity: number; productItemCode: string; productName: string; productId: string }>;
}) {
  return {
    id: receipt.id,
    reference: receipt.reference,
    supplier: receipt.supplier,
    supplierName: receipt.supplierName,
    notes: receipt.notes,
    receivedAt: receipt.receivedAt.toISOString(),
    location: receipt.location,
    lines: receipt.lines,
  };
}

export async function listStockReceipts(actor: AuthContext) {
  assertCapability(actor, "stock-receipts:view");

  const receipts = await prisma.stockReceipt.findMany({
    where: hasAllLocationAccess(actor) ? {} : { locationId: { in: [...actor.locationIds] } },
    orderBy: { receivedAt: "desc" },
    include: {
      location: { select: { id: true, code: true, name: true } },
      supplier: { select: { id: true, code: true, name: true } },
      lines: { select: { productId: true, quantity: true, acceptedQuantity: true, quarantinedQuantity: true, missingQuantity: true, productItemCode: true, productName: true } },
    },
  });
  return receipts.map(serializeReceipt);
}

export async function createStockReceipt(actor: AuthContext, input: CreateStockReceiptInput) {
  assertCapability(actor, "inventory-receiving:create");
  const productIds = input.lines.map((line) => line.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw new StockReceiptError("INVALID_LINES", "A product may appear only once", 400);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const stockRoom = await tx.location.findFirst({
        where: { code: "SR", type: "WAREHOUSE", isActive: true },
        select: { id: true, code: true, name: true },
      });
      if (!stockRoom) {
        throw new StockReceiptError("FORBIDDEN", "Supplier receipts may only be posted to active Stock Room", 403);
      }
      if (!canAccessLocation(actor, stockRoom.id)) {
        throw new StockReceiptError("FORBIDDEN", "Stock Room is outside your assigned locations", 403);
      }

      const supplier = await tx.supplier.findFirst({
        where: { id: input.supplierId, status: "ACTIVE" },
        select: { id: true, code: true, name: true },
      });
      if (!supplier) {
        throw new StockReceiptError("INVALID_SUPPLIER", "Select an active supplier", 400);
      }

      const products = await tx.product.findMany({
        where: { id: { in: productIds }, status: "ACTIVE" },
        select: { id: true, itemCode: true, name: true },
      });
      if (products.length !== productIds.length) {
        throw new StockReceiptError("INVALID_LINES", "Every received product must be active", 400);
      }
      const productsById = new Map(products.map((product) => [product.id, product]));

      const receipt = await tx.stockReceipt.create({
        data: {
          reference: input.reference,
          supplierId: supplier.id,
          supplierName: supplier.name,
          notes: input.notes || null,
          locationId: stockRoom.id,
          receivedById: actor.userId,
          lines: {
            create: input.lines.map((line) => {
              const product = productsById.get(line.productId)!;
              return {
                productId: product.id,
                quantity: line.expectedQuantity,
                acceptedQuantity: line.acceptedQuantity,
                quarantinedQuantity: line.quarantinedQuantity,
                missingQuantity: line.missingQuantity,
                productItemCode: product.itemCode,
                productName: product.name,
              };
            }),
          },
        },
        include: {
          location: { select: { id: true, code: true, name: true } },
          supplier: { select: { id: true, code: true, name: true } },
          lines: { select: { productId: true, quantity: true, acceptedQuantity: true, quarantinedQuantity: true, missingQuantity: true, productItemCode: true, productName: true } },
        },
      });

      for (const line of input.lines) {
        const receivedQuantity = line.acceptedQuantity + line.quarantinedQuantity;
        if (receivedQuantity === 0) continue;
        await tx.inventoryBalance.upsert({
          where: { locationId_productId: { locationId: stockRoom.id, productId: line.productId } },
            create: { locationId: stockRoom.id, productId: line.productId, onHand: receivedQuantity, quarantined: line.quarantinedQuantity, unitCost: new Prisma.Decimal(line.unitCost) },
            update: { onHand: { increment: receivedQuantity }, quarantined: { increment: line.quarantinedQuantity }, unitCost: new Prisma.Decimal(line.unitCost), version: { increment: 1 } },
        });
        await tx.inventoryMovement.create({
          data: {
            receiptId: receipt.id,
            productId: line.productId,
            locationId: stockRoom.id,
            quantity: receivedQuantity,
            type: "SUPPLIER_RECEIPT",
            actorId: actor.userId,
          },
        });
      }

      const affected = input.lines.filter((line) => line.quarantinedQuantity > 0 || line.missingQuantity > 0);
      if (affected.length > 0) {
        const claimReference = `SC-${receipt.reference}-${receipt.id.slice(-6).toUpperCase()}`;
        await tx.supplierClaim.create({
          data: {
            reference: claimReference,
            idempotencyKey: `receipt:${receipt.id}`,
            supplierId: supplier.id,
            supplierName: supplier.name,
            locationId: stockRoom.id,
            locationCode: stockRoom.code,
            locationName: stockRoom.name,
            sourceReceiptId: receipt.id,
            notes: `Automatically created from affected receipt ${receipt.reference}.`,
            createdById: actor.userId,
            lines: { create: affected.map((line) => {
              const product = productsById.get(line.productId)!;
              return { productId: line.productId, reason: line.claimReason!, claimedQuantity: line.quarantinedQuantity + line.missingQuantity, quarantinedQuantity: line.quarantinedQuantity, missingQuantity: line.missingQuantity, openQuarantinedQuantity: line.quarantinedQuantity, openMissingQuantity: line.missingQuantity, productItemCode: product.itemCode, productName: product.name, unitCost: new Prisma.Decimal(line.unitCost), notes: line.claimNotes };
            }) },
          },
        });
      }

      return serializeReceipt(receipt);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new StockReceiptError("DUPLICATE_REFERENCE", "Receipt reference already exists");
    }
    throw error;
  }
}
