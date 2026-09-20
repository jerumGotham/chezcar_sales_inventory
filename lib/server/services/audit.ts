import "server-only";

import { z } from "zod";

import {
  AUDIT_CATEGORIES,
  type AuditCategory,
  type AuditEntryDto,
  type AuditTrailDto,
} from "@/lib/contracts/audit";
import { assertCapability, type AuthContext } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";

// Every source is read with this ceiling so one busy module cannot starve the
// others out of a merged page. The response reports when a ceiling was hit.
const SOURCE_LIMIT = 500;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  category: z.enum(AUDIT_CATEGORIES).optional(),
  search: z.string().trim().max(200).default(""),
  dateFrom: date.optional(),
  dateTo: date.optional(),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;

function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function money(value: { toNumber: () => number }) {
  return `₱${value.toNumber().toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

function entry(
  id: string,
  occurredAt: Date,
  category: AuditCategory,
  action: string,
  actor: string | null | undefined,
  reference: string,
  location: string,
  details: string,
): AuditEntryDto {
  return {
    id,
    occurredAt: occurredAt.toISOString(),
    category,
    action,
    actor: actor ?? "Unknown user",
    reference,
    location,
    details,
  };
}

function occurredAtFilter(query: AuditQuery) {
  const gte = query.dateFrom ? new Date(`${query.dateFrom}T00:00:00.000Z`) : undefined;
  const lte = query.dateTo ? new Date(`${query.dateTo}T23:59:59.999Z`) : undefined;
  return gte || lte ? { gte, lte } : undefined;
}

async function inventoryEntries(range: ReturnType<typeof occurredAtFilter>) {
  const movements = await prisma.inventoryMovement.findMany({
    where: range ? { occurredAt: range } : undefined,
    orderBy: { occurredAt: "desc" },
    take: SOURCE_LIMIT,
    include: {
      product: { select: { itemCode: true, name: true } },
      location: { select: { name: true } },
      actor: { select: { name: true } },
    },
  });
  return movements.map((movement) => entry(
    `movement-${movement.id}`,
    movement.occurredAt,
    "Inventory",
    humanize(movement.type),
    movement.actor?.name,
    movement.reference ?? "-",
    movement.location?.name ?? "-",
    `${movement.quantity > 0 ? "+" : ""}${movement.quantity} ${movement.product.itemCode} ${movement.product.name}${movement.remarks ? `. ${movement.remarks}` : ""}`,
  ));
}

async function receiptEntries(range: ReturnType<typeof occurredAtFilter>) {
  const receipts = await prisma.stockReceipt.findMany({
    where: range ? { receivedAt: range } : undefined,
    orderBy: { receivedAt: "desc" },
    take: SOURCE_LIMIT,
    include: {
      location: { select: { name: true } },
      supplier: { select: { name: true } },
      receivedBy: { select: { name: true } },
    },
  });
  return receipts.map((receipt) => entry(
    `receipt-${receipt.id}`,
    receipt.receivedAt,
    "Inventory",
    "Supplier Receipt Recorded",
    receipt.receivedBy.name,
    receipt.reference,
    receipt.location.name,
    `Received from ${receipt.supplier.name}`,
  ));
}

async function saleEntries(range: ReturnType<typeof occurredAtFilter>) {
  const sales = await prisma.sale.findMany({
    where: range ? { OR: [{ postedAt: range }, { correctedAt: range }] } : undefined,
    orderBy: { postedAt: "desc" },
    take: SOURCE_LIMIT,
    include: {
      location: { select: { name: true } },
      customer: { select: { name: true } },
      postedBy: { select: { name: true } },
      correctedBy: { select: { name: true } },
    },
  });
  const rows: AuditEntryDto[] = [];
  for (const sale of sales) {
    const who = sale.customer?.name ?? "Guest";
    rows.push(entry(
      `sale-posted-${sale.id}`,
      sale.postedAt,
      "Sales",
      sale.orderId ? "Customer Order Sale Posted" : "Direct Sale Posted",
      sale.postedBy.name,
      sale.reference,
      sale.location.name,
      `Receipt ${sale.manualReceiptNumber} for ${who}, ${money(sale.totalAmount)}`,
    ));
    if (sale.correctedAt) {
      rows.push(entry(
        `sale-corrected-${sale.id}`,
        sale.correctedAt,
        "Sales",
        sale.status === "VOIDED" ? "Sale Voided" : "Sale Corrected",
        sale.correctedBy?.name,
        sale.reference,
        sale.location.name,
        `Receipt ${sale.manualReceiptNumber} for ${who}`,
      ));
    }
  }
  return rows;
}

async function correctionEntries(range: ReturnType<typeof occurredAtFilter>) {
  const requests = await prisma.saleCorrectionRequest.findMany({
    where: range ? { OR: [{ requestedAt: range }, { resolvedAt: range }] } : undefined,
    orderBy: { requestedAt: "desc" },
    take: SOURCE_LIMIT,
    include: {
      sale: { select: { reference: true, manualReceiptNumber: true, location: { select: { name: true } } } },
      requestedBy: { select: { name: true } },
      resolvedBy: { select: { name: true } },
    },
  });
  const rows: AuditEntryDto[] = [];
  for (const request of requests) {
    rows.push(entry(
      `correction-requested-${request.id}`,
      request.requestedAt,
      "Sales",
      "Sale Correction Requested",
      request.requestedBy.name,
      request.sale.reference,
      request.sale.location.name,
      `${humanize(request.reason)}. ${request.note}`,
    ));
    if (request.resolvedAt) {
      rows.push(entry(
        `correction-resolved-${request.id}`,
        request.resolvedAt,
        "Sales",
        `Sale Correction ${humanize(request.status)}`,
        request.resolvedBy?.name,
        request.sale.reference,
        request.sale.location.name,
        `${request.resolution ? humanize(request.resolution) : "Resolved"}${request.resolutionNote ? `. ${request.resolutionNote}` : ""}`,
      ));
    }
  }
  return rows;
}

async function reviewEntries(range: ReturnType<typeof occurredAtFilter>) {
  const reviews = await prisma.saleAccountingReview.findMany({
    where: range
      ? { OR: [{ reviewedAt: range }, { resolvedAt: range }, { branchRespondedAt: range }] }
      : { OR: [{ reviewedAt: { not: null } }, { resolvedAt: { not: null } }, { branchRespondedAt: { not: null } }] },
    orderBy: { reviewedAt: "desc" },
    take: SOURCE_LIMIT,
    include: {
      sale: { select: { reference: true, manualReceiptNumber: true, location: { select: { name: true } } } },
      reviewedBy: { select: { name: true } },
      resolvedBy: { select: { name: true } },
      branchRespondedBy: { select: { name: true } },
    },
  });
  const rows: AuditEntryDto[] = [];
  for (const review of reviews) {
    const place = review.sale.location.name;
    if (review.reviewedAt) {
      rows.push(entry(
        `review-${review.id}`,
        review.reviewedAt,
        "Receipt Verification",
        review.status === "MISMATCH_REPORTED" ? "Mismatch Reported" : "Receipt Verified",
        review.reviewedBy?.name,
        review.sale.reference,
        place,
        `Receipt ${review.sale.manualReceiptNumber}${review.mismatchCategory ? `. ${review.mismatchCategory}` : ""}${review.notes ? `. ${review.notes}` : ""}`,
      ));
    }
    if (review.branchRespondedAt) {
      rows.push(entry(
        `review-response-${review.id}`,
        review.branchRespondedAt,
        "Receipt Verification",
        "Branch Response Submitted",
        review.branchRespondedBy?.name,
        review.sale.reference,
        place,
        `${review.branchResponse ? humanize(review.branchResponse) : "Response"}${review.branchResponseNote ? `. ${review.branchResponseNote}` : ""}`,
      ));
    }
    if (review.resolvedAt) {
      rows.push(entry(
        `review-resolved-${review.id}`,
        review.resolvedAt,
        "Receipt Verification",
        "Mismatch Resolved",
        review.resolvedBy?.name,
        review.sale.reference,
        place,
        `${review.resolutionAction ? humanize(review.resolutionAction) : "Resolved"}${review.resolutionNote ? `. ${review.resolutionNote}` : ""}`,
      ));
    }
  }
  return rows;
}

async function orderEntries(range: ReturnType<typeof occurredAtFilter>) {
  const orders = await prisma.customerOrder.findMany({
    where: range ? { OR: [{ createdAt: range }, { releasedAt: range }, { cancelledAt: range }] } : undefined,
    orderBy: { createdAt: "desc" },
    take: SOURCE_LIMIT,
    include: {
      location: { select: { name: true } },
      customer: { select: { name: true } },
      createdBy: { select: { name: true } },
      releasedBy: { select: { name: true } },
      cancelledBy: { select: { name: true } },
    },
  });
  const rows: AuditEntryDto[] = [];
  for (const order of orders) {
    rows.push(entry(
      `order-created-${order.id}`,
      order.createdAt,
      "Customer Orders",
      `${humanize(order.type)} Booked`,
      order.createdBy.name,
      order.reference,
      order.location.name,
      `${order.customer.name}, total ${money(order.totalAmount)}, downpayment ${money(order.downpaymentAmount)}`,
    ));
    if (order.releasedAt) {
      rows.push(entry(
        `order-released-${order.id}`,
        order.releasedAt,
        "Customer Orders",
        "Order Released",
        order.releasedBy?.name,
        order.reference,
        order.location.name,
        `${order.customer.name}${order.finalReceiptNumber ? `, receipt ${order.finalReceiptNumber}` : ""}`,
      ));
    }
    if (order.cancelledAt) {
      rows.push(entry(
        `order-cancelled-${order.id}`,
        order.cancelledAt,
        "Customer Orders",
        "Order Cancelled",
        order.cancelledBy?.name,
        order.reference,
        order.location.name,
        `${order.customer.name}${order.cancellationNote ? `. ${order.cancellationNote}` : ""}`,
      ));
    }
  }
  return rows;
}

async function transferEntries(range: ReturnType<typeof occurredAtFilter>) {
  const transfers = await prisma.stockTransfer.findMany({
    where: range
      ? { OR: [{ createdAt: range }, { finalizedAt: range }, { dispatchedAt: range }, { receivedAt: range }, { cancelledAt: range }] }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: SOURCE_LIMIT,
    include: {
      destination: { select: { name: true } },
      createdBy: { select: { name: true } },
      finalizedBy: { select: { name: true } },
      dispatchedBy: { select: { name: true } },
      receivedBy: { select: { name: true } },
      cancelledBy: { select: { name: true } },
    },
  });
  const rows: AuditEntryDto[] = [];
  for (const transfer of transfers) {
    const place = transfer.destination.name;
    const steps: Array<[string, Date | null, string | null | undefined]> = [
      ["Transfer Drafted", transfer.createdAt, transfer.createdBy.name],
      ["Transfer Finalized", transfer.finalizedAt, transfer.finalizedBy?.name],
      ["Transfer Dispatched", transfer.dispatchedAt, transfer.dispatchedBy?.name],
      ["Transfer Received", transfer.receivedAt, transfer.receivedBy?.name],
      ["Transfer Cancelled", transfer.cancelledAt, transfer.cancelledBy?.name],
    ];
    for (const [action, at, actor] of steps) {
      if (!at) continue;
      rows.push(entry(
        `transfer-${action.toLowerCase().replaceAll(" ", "-")}-${transfer.id}`,
        at,
        "Stock Transfers",
        action,
        actor,
        transfer.reference,
        place,
        `Status ${humanize(transfer.status)}`,
      ));
    }
  }
  return rows;
}

async function returnEntries(range: ReturnType<typeof occurredAtFilter>) {
  const [backjobs, warranties] = await Promise.all([
    prisma.backjobEvent.findMany({
      where: range ? { occurredAt: range } : undefined,
      orderBy: { occurredAt: "desc" },
      take: SOURCE_LIMIT,
      include: {
        actor: { select: { name: true } },
        backjob: { select: { reference: true, locationName: true, customerName: true } },
      },
    }),
    prisma.customerWarrantyEvent.findMany({
      where: range ? { occurredAt: range } : undefined,
      orderBy: { occurredAt: "desc" },
      take: SOURCE_LIMIT,
      include: {
        actor: { select: { name: true } },
        warranty: { select: { reference: true, locationName: true, customerName: true } },
      },
    }),
  ]);
  return [
    ...backjobs.map((event) => entry(
      `backjob-${event.id}`,
      event.occurredAt,
      "Returns & Warranty",
      `Backjob ${humanize(event.type)}`,
      event.actor.name,
      event.backjob.reference,
      event.backjob.locationName,
      `${event.backjob.customerName}${event.toStatus ? `, now ${humanize(event.toStatus)}` : ""}${event.reason ? `. ${event.reason}` : ""}`,
    )),
    ...warranties.map((event) => entry(
      `warranty-${event.id}`,
      event.occurredAt,
      "Returns & Warranty",
      `Warranty ${humanize(event.type)}`,
      event.actor.name,
      event.warranty.reference,
      event.warranty.locationName,
      `${event.warranty.customerName}${event.toStatus ? `, now ${humanize(event.toStatus)}` : ""}`,
    )),
  ];
}

export async function getAuditTrail(
  actor: AuthContext,
  input: unknown = {},
): Promise<AuditTrailDto> {
  assertCapability(actor, "audit:view");
  const query = auditQuerySchema.parse(input);
  const range = occurredAtFilter(query);

  const sources: Array<[AuditCategory, () => Promise<AuditEntryDto[]>]> = [
    ["Inventory", () => inventoryEntries(range)],
    ["Inventory", () => receiptEntries(range)],
    ["Sales", () => saleEntries(range)],
    ["Sales", () => correctionEntries(range)],
    ["Receipt Verification", () => reviewEntries(range)],
    ["Customer Orders", () => orderEntries(range)],
    ["Stock Transfers", () => transferEntries(range)],
    ["Returns & Warranty", () => returnEntries(range)],
  ];
  const settled = await Promise.all(sources
    .filter(([category]) => !query.category || category === query.category)
    .map(([, load]) => load()));

  const truncated = settled.some((rows) => rows.length >= SOURCE_LIMIT);
  const needle = query.search.toLowerCase();
  const rows = settled
    .flat()
    .filter((row) => !needle || `${row.action} ${row.actor} ${row.reference} ${row.location} ${row.details}`.toLowerCase().includes(needle))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, totalPages);
  return {
    data: rows.slice((page - 1) * query.pageSize, page * query.pageSize),
    meta: { page, pageSize: query.pageSize, total, totalPages, truncated },
    filters: { categories: AUDIT_CATEGORIES },
  };
}
