import "server-only";

import { Prisma } from "@prisma/client";

import type { CreateStockReceiptInput } from "@/lib/contracts/stock-receipts";
import type { AuthContext } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";

export class StockReceiptError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 409) {
    super(message);
  }
}

function assertStockRoomReceivingActor(actor: AuthContext) {
  if (actor.role === "ADMIN") {
    return;
  }
  if (
    actor.role !== "STOCK_STAFF" ||
    actor.locationId === null ||
    actor.location?.id !== actor.locationId ||
    actor.location.code !== "SR" ||
    actor.location.type !== "WAREHOUSE" ||
    !actor.location.isActive
  ) {
    throw new StockReceiptError("FORBIDDEN", "Only Admin or Stock Staff assigned to Stock Room may post supplier receipts", 403);
  }
}

function serializeReceipt(receipt: {
  id: string;
  reference: string;
  supplier: string;
  notes: string | null;
  receivedAt: Date;
  location: { id: string; code: string; name: string };
  lines: Array<{ quantity: number; productItemCode: string; productName: string; productId: string }>;
}) {
  return {
    id: receipt.id,
    reference: receipt.reference,
    supplier: receipt.supplier,
    notes: receipt.notes,
    receivedAt: receipt.receivedAt.toISOString(),
    location: receipt.location,
    lines: receipt.lines,
  };
}

export async function listStockReceipts(actor: AuthContext) {
  if (actor.role !== "STOCK_STAFF" && actor.role !== "ADMIN") {
    throw new StockReceiptError("FORBIDDEN", "Supplier receipts are restricted to Stock Staff and Admin", 403);
  }

  const receipts = await prisma.stockReceipt.findMany({
    orderBy: { receivedAt: "desc" },
    include: {
      location: { select: { id: true, code: true, name: true } },
      lines: { select: { productId: true, quantity: true, productItemCode: true, productName: true } },
    },
  });
  return receipts.map(serializeReceipt);
}

export async function createStockReceipt(actor: AuthContext, input: CreateStockReceiptInput) {
  assertStockRoomReceivingActor(actor);
  const productIds = input.lines.map((line) => line.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw new StockReceiptError("INVALID_LINES", "A product may appear only once", 400);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const stockRoom = await tx.location.findFirst({
        where: actor.role === "ADMIN"
          ? { code: "SR", type: "WAREHOUSE", isActive: true }
          : { id: actor.locationId!, code: "SR", type: "WAREHOUSE", isActive: true },
        select: { id: true, code: true, name: true },
      });
      if (!stockRoom) {
        throw new StockReceiptError("FORBIDDEN", "Supplier receipts may only be posted to active Stock Room", 403);
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
          supplier: input.supplier,
          notes: input.notes || null,
          locationId: stockRoom.id,
          receivedById: actor.userId,
          lines: {
            create: input.lines.map((line) => {
              const product = productsById.get(line.productId)!;
              return {
                productId: product.id,
                quantity: line.quantity,
                productItemCode: product.itemCode,
                productName: product.name,
              };
            }),
          },
        },
        include: {
          location: { select: { id: true, code: true, name: true } },
          lines: { select: { productId: true, quantity: true, productItemCode: true, productName: true } },
        },
      });

      for (const line of input.lines) {
        await tx.inventoryBalance.upsert({
          where: { locationId_productId: { locationId: stockRoom.id, productId: line.productId } },
          create: { locationId: stockRoom.id, productId: line.productId, onHand: line.quantity, unitCost: new Prisma.Decimal(line.unitCost) },
          update: { onHand: { increment: line.quantity }, unitCost: new Prisma.Decimal(line.unitCost), version: { increment: 1 } },
        });
        await tx.inventoryMovement.create({
          data: {
            receiptId: receipt.id,
            productId: line.productId,
            locationId: stockRoom.id,
            quantity: line.quantity,
            type: "SUPPLIER_RECEIPT",
            actorId: actor.userId,
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
