import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type PaymentMethod } from "@prisma/client";
import { z } from "zod";

import {
  quarantineReleaseSchema,
  saleRefundSchema,
  type RefundDto,
  type SaleRefundableDto,
} from "@/lib/contracts/refunds";
import {
  assertCapability,
  type AuthContext,
} from "../authorization";
import { prisma } from "../prisma";
import { recordAuditLog } from "./audit-log";
import { receiptEvidenceVersion } from "./receipt-evidence";
import { canAccessLocation, hasAllLocationAccess } from "../policy/access";
import { notifyInventoryThresholdChange } from "./notifications";
import { availableStock } from "@/lib/inventory-quantity";

export class RefundError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "RefundError";
  }
}

/**
 * Money is compared and apportioned in whole centavos. A partial refund splits
 * a discount across lines, and a float would leave a stray centavo behind that
 * no one can refund and the ledger can never settle.
 */
const cents = (value: number) => Math.round(value * 100);
const pesos = (value: number) => value / 100;

const SALE_INCLUDE = {
  lines: true,
  location: { select: { id: true, code: true, name: true } },
  customer: { select: { id: true, name: true } },
  payment: { select: { amount: true, method: true } },
  refunds: { include: { lines: true } },
} satisfies Prisma.SaleInclude;

type SaleWithRefunds = Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>;

function assertSaleAccess(actor: AuthContext, locationId: string) {
  if (!canAccessLocation(actor, locationId)) {
    throw new RefundError("FORBIDDEN", "That sale is outside your assigned branches", 403);
  }
}

/**
 * What a sale has left to give back. Earlier refunds are subtracted from both
 * the money and each line, so a second refund cannot return the same unit
 * twice or hand back more than was ever collected.
 */
function refundableView(sale: SaleWithRefunds) {
  const subtotalCents = sale.lines.reduce(
    (sum, line) => sum + cents(line.unitPrice.toNumber()) * line.quantity,
    0,
  );
  const totalCents = cents(sale.totalAmount.toNumber());
  const paidCents = cents(sale.amountPaid.toNumber());
  const refundedCents = sale.refunds.reduce((sum, refund) => sum + cents(refund.amount.toNumber()), 0);

  const returnedByProduct = new Map<string, number>();
  for (const refund of sale.refunds) {
    for (const line of refund.lines) {
      returnedByProduct.set(line.productId, (returnedByProduct.get(line.productId) ?? 0) + line.quantity);
    }
  }

  return {
    subtotalCents,
    totalCents,
    paidCents,
    refundedCents,
    refundableCents: Math.max(0, paidCents - refundedCents),
    returnedByProduct,
  };
}

/**
 * What one line is worth once the sale's discount is spread across it. A sale
 * of 10,000 with a 1,000 discount gives back 90% of a returned line, not its
 * full sticker price, or the refund would exceed what the customer ever paid.
 */
function lineRefundCents(
  unitPriceCents: number,
  quantity: number,
  subtotalCents: number,
  totalCents: number,
) {
  const gross = unitPriceCents * quantity;
  if (subtotalCents <= 0) return 0;
  return Math.round((gross * totalCents) / subtotalCents);
}

export async function getSaleRefundable(actor: AuthContext, saleId: string): Promise<SaleRefundableDto> {
  assertCapability(actor, "sales:refund");
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: SALE_INCLUDE });
  if (!sale) throw new RefundError("NOT_FOUND", "Sale not found", 404);
  assertSaleAccess(actor, sale.locationId);
  if (sale.status !== "POSTED") {
    throw new RefundError("INVALID_STATE", "Only a posted sale can be refunded", 409);
  }

  const view = refundableView(sale);
  return {
    saleId: sale.id,
    reference: sale.reference,
    branch: `${sale.location.code} - ${sale.location.name}`,
    branchId: sale.locationId,
    customer: sale.customer?.name ?? "Walk-in",
    soldAt: sale.soldAt.toISOString(),
    totalAmount: pesos(view.totalCents),
    amountPaid: pesos(view.paidCents),
    alreadyRefunded: pesos(view.refundedCents),
    refundableAmount: pesos(view.refundableCents),
    lines: sale.lines.map((line) => {
      const returned = view.returnedByProduct.get(line.productId) ?? 0;
      return {
        productId: line.productId,
        itemCode: line.productItemCode,
        name: line.productName,
        quantity: line.quantity,
        unitPrice: line.unitPrice.toNumber(),
        alreadyReturned: returned,
        returnableQuantity: Math.max(0, line.quantity - returned),
      };
    }),
  };
}

/**
 * Put returned units back. A resellable unit raises on-hand alone; a
 * quarantined one raises on-hand and quarantine together, which is how the rest
 * of the system already models quarantine as a slice of what is physically
 * present but not available to sell.
 */
async function returnStock(
  tx: Prisma.TransactionClient,
  actor: AuthContext,
  params: {
    locationId: string;
    productId: string;
    quantity: number;
    quarantined: boolean;
    reference: string;
    remarks: string;
  },
) {
  const existing = await tx.inventoryBalance.findUnique({
    where: { locationId_productId: { locationId: params.locationId, productId: params.productId } },
    include: {
      product: { select: { itemCode: true, name: true, reorderLevel: true } },
      location: { select: { name: true } },
    },
  });
  const previousAvailable = existing ? availableStock(existing) : 0;

  await tx.inventoryBalance.upsert({
    where: { locationId_productId: { locationId: params.locationId, productId: params.productId } },
    create: {
      locationId: params.locationId,
      productId: params.productId,
      onHand: params.quantity,
      quarantined: params.quarantined ? params.quantity : 0,
    },
    update: {
      onHand: { increment: params.quantity },
      ...(params.quarantined ? { quarantined: { increment: params.quantity } } : {}),
      version: { increment: 1 },
    },
  });

  await tx.inventoryMovement.create({
    data: {
      productId: params.productId,
      locationId: params.locationId,
      quantity: params.quantity,
      type: params.quarantined ? "SALE_REFUND_QUARANTINE" : "SALE_REFUND_RETURN",
      actorId: actor.userId,
      reference: params.reference,
      remarks: params.remarks,
    },
  });

  if (existing) {
    await notifyInventoryThresholdChange(tx, {
      balanceId: existing.id,
      locationId: params.locationId,
      locationName: existing.location.name,
      productItemCode: existing.product.itemCode,
      productName: existing.product.name,
      reorderLevel: existing.product.reorderLevel,
      previousAvailable,
      // A quarantined return is physically present but still unsellable, so it
      // must not be reported as stock recovering.
      nextAvailable: params.quarantined ? previousAvailable : previousAvailable + params.quantity,
    });
  }
}

export async function refundPostedSale(
  actor: AuthContext,
  saleId: string,
  input: z.infer<typeof saleRefundSchema>,
): Promise<RefundDto> {
  assertCapability(actor, "sales:refund");

  return prisma.$transaction(
    async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id: saleId }, include: SALE_INCLUDE });
      if (!sale) throw new RefundError("NOT_FOUND", "Sale not found", 404);
      assertSaleAccess(actor, sale.locationId);
      if (sale.status !== "POSTED") {
        throw new RefundError("INVALID_STATE", "Only a posted sale can be refunded", 409);
      }

      // Where the goods land. Normally the selling branch, but a customer may
      // hand them back at whichever shop is nearest, so an all-branch user may
      // choose. A branch user may only receive into a branch they work in.
      const stockLocationId = input.stockLocationId ?? sale.locationId;
      if (stockLocationId !== sale.locationId) {
        if (!hasAllLocationAccess(actor)) {
          throw new RefundError("FORBIDDEN", "Only an all-branch user may receive a return at another branch", 403);
        }
        const branch = await tx.location.findFirst({ where: { id: stockLocationId, isActive: true } });
        if (!branch) throw new RefundError("INVALID_LOCATION", "Select an active branch to receive the return", 400);
      }

      const view = refundableView(sale);
      if (view.refundableCents <= 0) {
        throw new RefundError("FULLY_REFUNDED", "This sale has already been refunded in full", 409);
      }

      const unitPriceByProduct = new Map(sale.lines.map((line) => [line.productId, line]));

      const requested = input.scope === "FULL"
        ? sale.lines.flatMap((line) => {
            const remaining = line.quantity - (view.returnedByProduct.get(line.productId) ?? 0);
            return remaining > 0
              ? [{ productId: line.productId, quantity: remaining, disposition: input.disposition }]
              : [];
          })
        : input.lines;

      for (const line of requested) {
        const sold = unitPriceByProduct.get(line.productId);
        if (!sold) {
          throw new RefundError("INVALID_LINES", "That item was not part of this sale", 400);
        }
        const remaining = sold.quantity - (view.returnedByProduct.get(line.productId) ?? 0);
        if (line.quantity > remaining) {
          throw new RefundError(
            "QUANTITY_EXCEEDED",
            `Only ${remaining} of ${sold.productName} can still be returned`,
            409,
          );
        }
      }

      // A full refund hands back everything still owed, which covers a goodwill
      // refund where nothing is returned. A partial refund is worth exactly the
      // lines coming back, discount included.
      const amountCents = input.scope === "FULL"
        ? view.refundableCents
        : requested.reduce(
            (sum, line) =>
              sum +
              lineRefundCents(
                cents(unitPriceByProduct.get(line.productId)!.unitPrice.toNumber()),
                line.quantity,
                view.subtotalCents,
                view.totalCents,
              ),
            0,
          );

      if (amountCents <= 0) {
        throw new RefundError("INVALID_AMOUNT", "This refund would hand back nothing", 400);
      }
      if (amountCents > view.refundableCents) {
        throw new RefundError(
          "AMOUNT_EXCEEDED",
          "A refund cannot exceed what the customer actually paid for this sale",
          409,
        );
      }

      const reference = `REF-${randomUUID()}`;
      const refund = await tx.refund.create({
        data: {
          reference,
          kind: "POSTED_SALE",
          locationId: sale.locationId,
          stockLocationId: requested.length ? stockLocationId : null,
          customerId: sale.customerId,
          orderId: sale.orderId,
          saleId: sale.id,
          amount: new Prisma.Decimal(pesos(amountCents)),
          method: (input.refundMethod ?? sale.paymentMethod) as PaymentMethod,
          acknowledgementNumber: input.acknowledgementNumber,
          reason: input.reason,
          salespersonId: sale.salespersonId,
          salespersonName: sale.salespersonName,
          salespersonLocationId: sale.salespersonLocationId,
          salespersonLocationCode: sale.salespersonLocationCode,
          salespersonLocationName: sale.salespersonLocationName,
          refundedById: actor.userId,
          lines: {
            create: requested.map((line) => {
              const sold = unitPriceByProduct.get(line.productId)!;
              return {
                productId: line.productId,
                productItemCode: sold.productItemCode,
                productName: sold.productName,
                quantity: line.quantity,
                unitPrice: sold.unitPrice,
                disposition: line.disposition,
              };
            }),
          },
        },
        include: { lines: true, location: { select: { code: true, name: true } }, stockLocation: { select: { code: true, name: true } }, customer: { select: { name: true } }, refundedBy: { select: { name: true } } },
      });

      for (const line of requested) {
        await returnStock(tx, actor, {
          locationId: stockLocationId,
          productId: line.productId,
          quantity: line.quantity,
          quarantined: line.disposition === "QUARANTINED",
          reference,
          remarks: `Refund of ${sale.reference} - ${input.reason}`,
        });
      }

      await recordAuditLog({
        category: "Sales",
        action: input.scope === "FULL" ? "Sale Refunded In Full" : "Sale Partially Refunded",
        actorId: actor.userId,
        reference: sale.reference,
        details: `${pesos(amountCents).toFixed(2)} refunded to ${sale.customer?.name ?? "walk-in"}; ${requested.length} line(s) returned`,
        items: requested.map((line) => {
          const sold = unitPriceByProduct.get(line.productId)!;
          return { name: `${sold.productItemCode} ${sold.productName}`, quantity: line.quantity };
        }),
        facts: [
          { label: "Refund reference", value: reference },
          { label: "Amount handed back", value: pesos(amountCents).toFixed(2) },
          { label: "Acknowledgement slip", value: input.acknowledgementNumber },
          { label: "Scope", value: input.scope === "FULL" ? "Full refund" : "Partial refund" },
          { label: "Returned stock branch", value: requested.length ? stockLocationId : "Nothing returned" },
          { label: "Reason", value: input.reason },
        ],
      });

      return serializeRefund(refund);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 },
  );
}

type RefundRecord = Prisma.RefundGetPayload<{
  include: {
    lines: true;
    location: { select: { code: true; name: true } };
    stockLocation: { select: { code: true; name: true } };
    customer: { select: { name: true } };
    refundedBy: { select: { name: true } };
  };
}>;

export function serializeRefund(refund: RefundRecord): RefundDto {
  return {
    id: refund.id,
    reference: refund.reference,
    kind: refund.kind,
    branch: `${refund.location.code} - ${refund.location.name}`,
    stockBranch: refund.stockLocation ? `${refund.stockLocation.code} - ${refund.stockLocation.name}` : null,
    customer: refund.customer?.name ?? null,
    orderId: refund.orderId,
    saleId: refund.saleId,
    amount: refund.amount.toNumber(),
    method: refund.method,
    acknowledgementNumber: refund.acknowledgementNumber,
    reason: refund.reason,
    salesperson: refund.salespersonName,
    refundedBy: refund.refundedBy.name,
    refundedAt: refund.refundedAt.toISOString(),
    lines: refund.lines.map((line) => ({
      productId: line.productId,
      itemCode: line.productItemCode,
      name: line.productName,
      quantity: line.quantity,
      unitPrice: line.unitPrice.toNumber(),
      disposition: line.disposition,
    })),
  };
}

/**
 * The way back out of quarantine. Nothing else in the system could do this:
 * quarantine was only ever cleared inside a warranty or supplier-claim case, so
 * a unit quarantined by a refund would otherwise never be sellable again.
 */
export async function releaseQuarantinedStock(
  actor: AuthContext,
  balanceId: string,
  input: z.infer<typeof quarantineReleaseSchema>,
) {
  assertCapability(actor, "inventory:quarantine-release");

  return prisma.$transaction(async (tx) => {
    const balance = await tx.inventoryBalance.findUnique({
      where: { id: balanceId },
      include: {
        product: { select: { itemCode: true, name: true, reorderLevel: true } },
        location: { select: { id: true, name: true } },
      },
    });
    if (!balance) throw new RefundError("NOT_FOUND", "Inventory balance not found", 404);
    if (!canAccessLocation(actor, balance.locationId)) {
      throw new RefundError("FORBIDDEN", "That branch is outside your assigned branches", 403);
    }
    if (input.quantity > balance.quarantined) {
      throw new RefundError(
        "QUANTITY_EXCEEDED",
        `Only ${balance.quarantined} unit(s) are in quarantine`,
        409,
      );
    }

    const previousAvailable = availableStock(balance);
    const updated = await tx.inventoryBalance.updateMany({
      where: { id: balance.id, version: balance.version, quarantined: { gte: input.quantity } },
      data: { quarantined: { decrement: input.quantity }, version: { increment: 1 } },
    });
    if (updated.count !== 1) {
      throw new RefundError("INVENTORY_CONFLICT", "Stock changed before the release; reload and try again", 409);
    }

    // On-hand does not move: the units were always physically present. Only
    // their availability changes.
    await tx.inventoryMovement.create({
      data: {
        productId: balance.productId,
        locationId: balance.locationId,
        quantity: input.quantity,
        type: "QUARANTINE_RELEASE",
        actorId: actor.userId,
        reference: input.reference || null,
        remarks: input.reason,
      },
    });

    await notifyInventoryThresholdChange(tx, {
      balanceId: balance.id,
      locationId: balance.locationId,
      locationName: balance.location.name,
      productItemCode: balance.product.itemCode,
      productName: balance.product.name,
      reorderLevel: balance.product.reorderLevel,
      previousAvailable,
      nextAvailable: previousAvailable + input.quantity,
    });

    await recordAuditLog({
      category: "Inventory",
      action: "Quarantine Released",
      actorId: actor.userId,
      reference: balance.product.itemCode,
      details: `${input.quantity} unit(s) returned to sellable stock at ${balance.location.name} - ${input.reason}`,
    });

    return { released: input.quantity, quarantinedRemaining: balance.quarantined - input.quantity };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}


/**
 * What an order has actually collected, shown in the cancellation dialog so the
 * person handing money back can see every receipt before deciding the amount.
 */
/*
 * A receipt that settles a sale is evidenced through that sale's review, so its
 * photo is served by the sale's route; every other receipt carries its own.
 * The version pins the image the list was read against.
 */
function paymentPhotoUrl(row: {
  id: string;
  saleId: string | null;
  receiptPhotoKey: string | null;
  sale: { accountingReview: { receiptPhotoKey: string | null } | null } | null;
}) {
  if (row.saleId) {
    const key = row.sale?.accountingReview?.receiptPhotoKey;
    return key ? `/api/accounting/receipts/${encodeURIComponent(row.saleId)}/photo?version=${receiptEvidenceVersion(key)}` : null;
  }
  return row.receiptPhotoKey
    ? `/api/accounting/payments/${encodeURIComponent(row.id)}/photo?version=${receiptEvidenceVersion(row.receiptPhotoKey)}`
    : null;
}

export async function listOrderPaymentHistory(actor: AuthContext, orderId: string) {
  assertCapability(actor, "customer-orders:view");
  const order = await prisma.customerOrder.findUnique({
    where: { id: orderId },
    select: { id: true, reference: true, locationId: true },
  });
  if (!order) throw new RefundError("NOT_FOUND", "Order not found", 404);
  if (!canAccessLocation(actor, order.locationId)) {
    throw new RefundError("FORBIDDEN", "That order is outside your assigned branches", 403);
  }

  const [payments, refunds] = await Promise.all([
    prisma.payment.findMany({
      where: { orderId, status: "ACTIVE" },
      orderBy: { collectedAt: "asc" },
      select: {
        id: true, kind: true, amount: true, method: true, receiptNumber: true,
        receiptBooklet: true, collectedAt: true, reviewStatus: true,
        collectedBy: { select: { name: true } },
        saleId: true, receiptPhotoKey: true,
        sale: { select: { accountingReview: { select: { receiptPhotoKey: true } } } },
      },
    }),
    prisma.refund.findMany({
      where: { orderId },
      orderBy: { refundedAt: "asc" },
      select: { id: true, amount: true, acknowledgementNumber: true, refundedAt: true },
    }),
  ]);

  const collected = payments.reduce((sum, row) => sum + row.amount.toNumber(), 0);
  const refunded = refunds.reduce((sum, row) => sum + row.amount.toNumber(), 0);

  return {
    orderId: order.id,
    reference: order.reference,
    collected,
    refunded,
    refundable: Math.max(0, collected - refunded),
    payments: payments.map((row) => ({
      id: row.id,
      kind: row.kind,
      amount: row.amount.toNumber(),
      method: row.method,
      receiptNumber: row.receiptBooklet ? `${row.receiptBooklet}-${row.receiptNumber}` : row.receiptNumber,
      collectedAt: row.collectedAt.toISOString(),
      collectedBy: row.collectedBy.name,
      reviewStatus: row.reviewStatus,
      receiptPhotoUrl: paymentPhotoUrl(row),
    })),
    refunds: refunds.map((row) => ({
      id: row.id,
      amount: row.amount.toNumber(),
      acknowledgementNumber: row.acknowledgementNumber,
      refundedAt: row.refundedAt.toISOString(),
    })),
  };
}
