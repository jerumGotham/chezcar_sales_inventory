import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type PaymentKind, type PaymentMethod } from "@prisma/client";
import { z } from "zod";

import {
  assertCapability,
  AuthorizationError,
  type AuthContext,
} from "../authorization";
import { prisma } from "../prisma";
import { canAccessLocation, hasAllLocationAccess } from "../policy/access";
import { recordAuditLog } from "./audit-log";
import { createNotifications } from "./notifications";
import { receiptEvidenceVersion } from "./receipt-evidence";

export class PaymentError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "PaymentError";
  }
}

const money = z.coerce.number().min(0);

export const PAYMENT_MISMATCH_CATEGORIES = [
  "AMOUNT_MISMATCH",
  "RECEIPT_NOT_FOUND",
  "DUPLICATE_RECEIPT",
  "OTHER",
] as const;

export const PAYMENT_BRANCH_RESPONSES = [
  "ORIGINAL_ENCODING_CORRECT",
  "RECEIPT_CORRECTION_NEEDED",
  "WRONG_RECEIPT_PHOTO",
  "PAYMENT_ENCODED_INCORRECTLY",
] as const;

export const paymentReviewSchema = z.object({
  status: z.enum(["VERIFIED", "MISMATCH_REPORTED"]),
  mismatchCategory: z.enum(PAYMENT_MISMATCH_CATEGORIES).optional(),
  notes: z.string().trim().max(5_000).optional(),
  receiptAmount: money.optional(),
  receiptNumber: z.string().trim().max(100).optional(),
}).superRefine((input, context) => {
  if (input.status === "MISMATCH_REPORTED" && !input.mismatchCategory) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["mismatchCategory"], message: "Mismatch category is required" });
  }
  if (input.status === "MISMATCH_REPORTED" && !input.notes) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["notes"], message: "Notes are required" });
  }
});

export const paymentBranchResponseSchema = z.object({
  response: z.enum(PAYMENT_BRANCH_RESPONSES),
  note: z.string().trim().min(1).max(5_000),
  replacementReceiptNumber: z.string().trim().min(1).max(100).optional(),
});

export const paymentResolutionSchema = z.object({
  action: z.enum(["CONFIRMED_CORRECT", "VOIDED"]),
  note: z.string().trim().min(1).max(5_000),
});

export const paymentVerificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(50).default(10),
  search: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, z.string().trim().max(200).optional()),
  reviewStatus: z.preprocess((value) => value === "" ? undefined : value, z.enum(["all", "UNVERIFIED", "VERIFIED", "MISMATCH_REPORTED"]).default("all")),
  locationId: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, z.string().trim().max(100).optional()),
  dateFrom: z.preprocess((value) => value === "" ? undefined : value, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  dateTo: z.preprocess((value) => value === "" ? undefined : value, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  paymentId: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().max(100).optional()),
}).superRefine((input, context) => {
  if (input.dateFrom && input.dateTo && input.dateFrom > input.dateTo) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["dateTo"], message: "End date must be on or after start date" });
  }
});

const PAYMENT_INCLUDE = {
  location: { select: { id: true, name: true, code: true } },
  customer: { select: { id: true, name: true } },
  order: { select: { id: true, reference: true, totalAmount: true, remainingBalance: true, status: true } },
  collectedBy: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
  branchRespondedBy: { select: { id: true, name: true } },
  resolvedBy: { select: { id: true, name: true } },
} satisfies Prisma.PaymentInclude;

type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>;

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  ORDER_DOWNPAYMENT: "Order Downpayment",
  ORDER_PAYMENT: "Order Payment",
  ORDER_FINAL: "Order Final Payment",
  DIRECT_SALE: "Direct Sale",
};

function decimal(value: number) {
  return new Prisma.Decimal(value);
}

function boundary(value: string, endOfDay = false) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + (endOfDay ? 1 : 0)));
}

function locationIdFilter(actor: AuthContext): Prisma.StringFilter | undefined {
  return hasAllLocationAccess(actor) ? undefined : { in: [...actor.locationIds] };
}

export function serializePayment(payment: PaymentRow) {
  return {
    id: payment.id,
    reference: payment.reference,
    kind: payment.kind,
    kindLabel: PAYMENT_KIND_LABELS[payment.kind],
    status: payment.status,
    branch: payment.location.name,
    branchCode: payment.location.code,
    locationId: payment.locationId,
    customer: payment.customer?.name ?? "Guest",
    orderId: payment.orderId,
    orderReference: payment.order?.reference ?? null,
    orderTotal: payment.order ? payment.order.totalAmount.toNumber() : null,
    orderBalance: payment.order ? payment.order.remainingBalance.toNumber() : null,
    saleId: payment.saleId,
    amount: payment.amount.toNumber(),
    method: payment.method,
    receiptBooklet: payment.receiptBooklet,
    receiptNumber: payment.receiptNumber,
    notes: payment.notes,
    salesperson: payment.salespersonName,
    collectedBy: payment.collectedBy.name,
    collectedAt: payment.collectedAt.toISOString(),
    reviewStatus: payment.reviewStatus,
    verifiedAt: payment.verifiedAt?.toISOString() ?? null,
    mismatchCategory: payment.mismatchCategory,
    reviewNotes: payment.reviewNotes,
    reviewedBy: payment.reviewedBy?.name ?? null,
    reviewedAt: payment.reviewedAt?.toISOString() ?? null,
    receiptPhotoUrl: payment.receiptPhotoKey
      ? `/api/accounting/payments/${payment.id}/photo?v=${payment.evidenceUploadedAt?.getTime() ?? 0}`
      : null,
    receiptPhotoVersion: payment.receiptPhotoKey ? receiptEvidenceVersion(payment.receiptPhotoKey) : null,
    branchResponse: payment.branchResponse,
    branchResponseNote: payment.branchResponseNote,
    branchReplacementReceiptNumber: payment.branchReplacementReceiptNumber,
    branchRespondedBy: payment.branchRespondedBy?.name ?? null,
    branchRespondedAt: payment.branchRespondedAt?.toISOString() ?? null,
    resolutionAction: payment.resolutionAction,
    resolutionNote: payment.resolutionNote,
    resolvedBy: payment.resolvedBy?.name ?? null,
    resolvedAt: payment.resolvedAt?.toISOString() ?? null,
    voidReason: payment.voidReason,
    voidedAt: payment.voidedAt?.toISOString() ?? null,
  };
}

export type PaymentDto = ReturnType<typeof serializePayment>;

type RecordPaymentInput = {
  kind: PaymentKind;
  locationId: string;
  customerId?: string | null;
  orderId?: string | null;
  saleId?: string | null;
  amount: number;
  method: PaymentMethod;
  receiptBooklet?: string;
  receiptNumber: string;
  notes?: string | null;
  salesperson?: {
    id: string | null;
    name: string | null;
    locationId: string | null;
    locationCode: string | null;
    locationName: string | null;
  } | null;
  collectedById: string;
  collectedAt?: Date;
  /**
   * A payment that settles a sale is verified through that sale's receipt
   * review, so its ledger row mirrors the sale instead of queueing a second
   * review of the very same piece of paper.
   */
  mirrorsSaleReview?: boolean;
};

/**
 * Writes the ledger row for one receipt. Every peso the business collects goes
 * through here exactly once, which is what lets the Sales report add up verified
 * receipts without counting a downpayment again inside its order's release.
 */
export async function recordPayment(tx: Prisma.TransactionClient, input: RecordPaymentInput) {
  return tx.payment.create({
    data: {
      reference: `PAY-${randomUUID()}`,
      kind: input.kind,
      locationId: input.locationId,
      customerId: input.customerId ?? null,
      orderId: input.orderId ?? null,
      saleId: input.saleId ?? null,
      amount: decimal(input.amount),
      method: input.method,
      receiptBooklet: input.receiptBooklet ?? "",
      receiptNumber: input.receiptNumber,
      notes: input.notes ?? null,
      salespersonId: input.salesperson?.id ?? null,
      salespersonName: input.salesperson?.name ?? null,
      salespersonLocationId: input.salesperson?.locationId ?? null,
      salespersonLocationCode: input.salesperson?.locationCode ?? null,
      salespersonLocationName: input.salesperson?.locationName ?? null,
      collectedById: input.collectedById,
      ...(input.collectedAt ? { collectedAt: input.collectedAt } : {}),
      ...(input.mirrorsSaleReview ? { reviewNotes: null } : {}),
    },
  });
}

/**
 * Keeps a sale-linked ledger row in step with the sale's own receipt review, so
 * the report never has to know which of the two tables verified the receipt.
 */
export async function syncSalePaymentReview(
  tx: Prisma.TransactionClient,
  saleId: string,
  review: { status: "UNVERIFIED" | "VERIFIED" | "MISMATCH_REPORTED"; verifiedAt: Date | null; reviewedById?: string | null; reviewedAt?: Date | null },
) {
  await tx.payment.updateMany({
    where: { saleId },
    data: {
      reviewStatus: review.status,
      verifiedAt: review.verifiedAt,
      ...(review.reviewedById === undefined ? {} : { reviewedById: review.reviewedById }),
      ...(review.reviewedAt === undefined ? {} : { reviewedAt: review.reviewedAt }),
    },
  });
}

export async function voidSalePayment(tx: Prisma.TransactionClient, saleId: string, reason: string, actorId: string) {
  await tx.payment.updateMany({
    where: { saleId },
    data: { status: "VOIDED", voidReason: reason, voidedById: actorId, voidedAt: new Date(), reviewStatus: "UNVERIFIED", verifiedAt: null },
  });
}

function paymentWhere(
  input: z.infer<typeof paymentVerificationListQuerySchema>,
  includeReviewStatus: boolean,
): Prisma.PaymentWhereInput {
  const where: Prisma.PaymentWhereInput = {
    // Sale receipts are reviewed on the sale tab; this queue owns the money that
    // arrives before a sale exists. A voided receipt stays in the list so the
    // reviewer can still see what was voided and why.
    saleId: null,
  };
  if (input.search) {
    where.OR = [
      { receiptNumber: { contains: input.search, mode: "insensitive" } },
      { reference: { contains: input.search, mode: "insensitive" } },
      { customer: { is: { name: { contains: input.search, mode: "insensitive" } } } },
      { order: { is: { reference: { contains: input.search, mode: "insensitive" } } } },
      { location: { name: { contains: input.search, mode: "insensitive" } } },
      { location: { code: { contains: input.search, mode: "insensitive" } } },
    ];
  }
  if (input.locationId) where.locationId = input.locationId;
  if (input.paymentId) where.id = input.paymentId;
  if (includeReviewStatus && input.reviewStatus !== "all") where.reviewStatus = input.reviewStatus;
  if (input.dateFrom || input.dateTo) {
    where.collectedAt = {
      ...(input.dateFrom ? { gte: boundary(input.dateFrom) } : {}),
      ...(input.dateTo ? { lt: boundary(input.dateTo, true) } : {}),
    };
  }
  return where;
}

export async function listPaymentVerifications(actor: AuthContext, rawInput: unknown) {
  assertCapability(actor, "sales:verify:view");
  const input = paymentVerificationListQuerySchema.parse(rawInput);
  const baseWhere = paymentWhere(input, false);
  const filteredWhere = paymentWhere(input, true);
  const permitted = locationIdFilter(actor);
  if (permitted) {
    baseWhere.locationId = permitted;
    filteredWhere.locationId = permitted;
  }
  const [totalItems, unverified, verified, mismatches, missingEvidence] = await Promise.all([
    prisma.payment.count({ where: filteredWhere }),
    prisma.payment.count({ where: { ...baseWhere, reviewStatus: "UNVERIFIED", status: "ACTIVE" } }),
    prisma.payment.count({ where: { ...baseWhere, reviewStatus: "VERIFIED" } }),
    prisma.payment.count({ where: { ...baseWhere, reviewStatus: "MISMATCH_REPORTED", status: "ACTIVE" } }),
    prisma.payment.count({ where: { ...baseWhere, receiptPhotoKey: null, status: "ACTIVE" } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalItems / input.pageSize));
  const page = Math.min(input.page, totalPages);
  const payments = await prisma.payment.findMany({
    where: filteredWhere,
    orderBy: { collectedAt: "desc" },
    skip: (page - 1) * input.pageSize,
    take: input.pageSize,
    include: PAYMENT_INCLUDE,
  });
  return {
    data: payments.map(serializePayment),
    meta: { page, pageSize: input.pageSize, totalItems, totalPages, unverified, verified, mismatches, missingEvidence },
  };
}

export async function getPaymentById(actor: AuthContext, paymentId: string) {
  assertCapability(actor, "sales:verify:view");
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: PAYMENT_INCLUDE });
  if (!payment) throw new PaymentError("NOT_FOUND", "Payment not found", 404);
  if (!canAccessLocation(actor, payment.locationId)) throw new AuthorizationError("Insufficient permissions");
  return serializePayment(payment);
}

async function accountingRecipients(tx: Prisma.TransactionClient, locationId: string) {
  return tx.user.findMany({
    where: {
      status: "ACTIVE",
      accessRole: { OR: [{ isOwner: true }, { permissions: { has: "sales:verify" } }] },
      OR: [
        { accessRole: { isOwner: true } },
        { accessRole: { permissions: { has: "locations:all" } } },
        { locationAssignments: { some: { locationId } } },
      ],
    },
    select: { id: true },
  });
}

async function branchRecipients(tx: Prisma.TransactionClient, payment: { collectedById: string; locationId: string }) {
  const users = await tx.user.findMany({
    where: {
      status: "ACTIVE",
      accessRole: { permissions: { has: "sales:mismatch:respond" } },
      locationAssignments: { some: { locationId: payment.locationId } },
    },
    select: { id: true },
  });
  return Array.from(new Set([payment.collectedById, ...users.map((user) => user.id)]));
}

export async function notifyPaymentEvidenceUploaded(paymentId: string) {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: PAYMENT_INCLUDE });
    if (!payment || payment.reviewStatus !== "UNVERIFIED" || !payment.receiptPhotoKey) return;
    const recipients = await accountingRecipients(tx, payment.locationId);
    await createNotifications(tx, recipients.map(({ id: userId }) => ({
      userId,
      title: "Payment receipt uploaded",
      description: `${PAYMENT_KIND_LABELS[payment.kind]} receipt ${payment.receiptNumber} is ready for Accounting review.`,
      type: "INFO" as const,
      relatedType: "PAYMENT" as const,
      relatedId: payment.id,
      relatedReference: payment.receiptNumber,
    })));
  });
}

export async function reviewPayment(actor: AuthContext, paymentId: string, input: z.infer<typeof paymentReviewSchema>) {
  assertCapability(actor, "sales:verify");
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: PAYMENT_INCLUDE });
    if (!payment) throw new PaymentError("NOT_FOUND", "Payment not found", 404);
    if (!canAccessLocation(actor, payment.locationId)) throw new AuthorizationError("Insufficient permissions");
    if (payment.saleId) throw new PaymentError("INVALID_STATE", "A sale receipt is reviewed on the sale receipt tab", 409);
    if (payment.status !== "ACTIVE") throw new PaymentError("INVALID_STATE", "A voided payment cannot be reviewed", 409);
    if (payment.reviewStatus !== "UNVERIFIED") throw new PaymentError("INVALID_STATE", "This payment receipt was already reviewed", 409);
    if (!payment.receiptPhotoKey) throw new PaymentError("EVIDENCE_REQUIRED", "Attach the receipt photo before reviewing", 409);

    const now = new Date();
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: {
        reviewStatus: input.status,
        verifiedAt: input.status === "VERIFIED" ? now : null,
        mismatchCategory: input.status === "MISMATCH_REPORTED" ? input.mismatchCategory : null,
        reviewNotes: input.notes ?? null,
        reviewedById: actor.userId,
        reviewedAt: now,
      },
      include: PAYMENT_INCLUDE,
    });

    if (input.status === "MISMATCH_REPORTED") {
      const recipients = await branchRecipients(tx, payment);
      await createNotifications(tx, recipients.map((userId) => ({
        userId,
        title: "Payment receipt mismatch reported",
        description: `Accounting reported a mismatch on receipt ${payment.receiptNumber}. Respond with what the branch holds.`,
        type: "WARNING" as const,
        relatedType: "PAYMENT" as const,
        relatedId: payment.id,
        relatedReference: payment.receiptNumber,
      })));
    }
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  await recordAuditLog({
    category: "Receipt Verification",
    action: input.status === "VERIFIED" ? "Payment Receipt Verified" : "Payment Receipt Mismatch Reported",
    actorId: actor.userId,
    reference: result.receiptNumber,
    locationLabel: result.location.name,
    details: `${PAYMENT_KIND_LABELS[result.kind]} of ₱${result.amount.toNumber().toLocaleString("en-PH", { minimumFractionDigits: 2 })} for ${result.customer?.name ?? "Guest"}${input.notes ? `. ${input.notes}` : ""}`,
    facts: [
      { label: "Receipt number", value: result.receiptNumber },
      { label: "Payment", value: `₱${result.amount.toNumber().toLocaleString("en-PH", { minimumFractionDigits: 2 })}` },
      { label: "Order", value: result.order?.reference ?? "-" },
      ...(input.mismatchCategory ? [{ label: "Mismatch", value: input.mismatchCategory.replace(/_/g, " ").toLowerCase() }] : []),
    ],
  });
  return serializePayment(result);
}

export async function respondToPaymentMismatch(actor: AuthContext, paymentId: string, input: z.infer<typeof paymentBranchResponseSchema>) {
  assertCapability(actor, "sales:mismatch:respond");
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: PAYMENT_INCLUDE });
    if (!payment) throw new PaymentError("NOT_FOUND", "Payment not found", 404);
    if (!canAccessLocation(actor, payment.locationId)) throw new AuthorizationError("Insufficient permissions");
    if (payment.reviewStatus !== "MISMATCH_REPORTED") throw new PaymentError("INVALID_STATE", "This payment has no reported mismatch", 409);
    if (payment.resolvedAt) throw new PaymentError("INVALID_STATE", "This mismatch was already resolved", 409);

    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: {
        branchResponse: input.response,
        branchResponseNote: input.note,
        branchReplacementReceiptNumber: input.replacementReceiptNumber ?? null,
        branchRespondedById: actor.userId,
        branchRespondedAt: new Date(),
      },
      include: PAYMENT_INCLUDE,
    });
    const recipients = await accountingRecipients(tx, payment.locationId);
    await createNotifications(tx, recipients.map(({ id: userId }) => ({
      userId,
      title: "Branch responded to a payment mismatch",
      description: `The branch answered the mismatch on receipt ${payment.receiptNumber}.`,
      type: "INFO" as const,
      relatedType: "PAYMENT" as const,
      relatedId: payment.id,
      relatedReference: payment.receiptNumber,
    })));
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  await recordAuditLog({
    category: "Receipt Verification",
    action: "Payment Mismatch Answered",
    actorId: actor.userId,
    reference: result.receiptNumber,
    locationLabel: result.location.name,
    details: `${input.response.replace(/_/g, " ").toLowerCase()}. ${input.note}`,
  });
  return serializePayment(result);
}

/**
 * Closes a reported mismatch. Voiding gives the money back to the order balance
 * and keeps the row as a voided record, because a receipt that was collected and
 * then disowned still has to be explainable later.
 */
export async function resolvePaymentMismatch(actor: AuthContext, paymentId: string, input: z.infer<typeof paymentResolutionSchema>) {
  assertCapability(actor, input.action === "VOIDED" ? "sales:void-replace" : "sales:resolve");
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: PAYMENT_INCLUDE });
    if (!payment) throw new PaymentError("NOT_FOUND", "Payment not found", 404);
    if (!canAccessLocation(actor, payment.locationId)) throw new AuthorizationError("Insufficient permissions");
    if (payment.reviewStatus !== "MISMATCH_REPORTED") throw new PaymentError("INVALID_STATE", "This payment has no reported mismatch", 409);
    if (payment.resolvedAt) throw new PaymentError("INVALID_STATE", "This mismatch was already resolved", 409);
    if (!payment.branchRespondedAt) throw new PaymentError("BRANCH_RESPONSE_REQUIRED", "Wait for the branch response before resolving", 409);

    const now = new Date();
    if (input.action === "VOIDED" && payment.orderId) {
      await tx.$queryRaw`SELECT id FROM "CustomerOrder" WHERE id = ${payment.orderId} FOR UPDATE`;
      const order = await tx.customerOrder.findUnique({ where: { id: payment.orderId } });
      if (!order) throw new PaymentError("NOT_FOUND", "Order not found", 404);
      if (order.status === "COMPLETED") {
        throw new PaymentError("INVALID_STATE", "A released order's payment cannot be voided; correct the sale instead", 409);
      }
      const restored = order.downpaymentAmount.toNumber() - payment.amount.toNumber();
      await tx.customerOrder.update({
        where: { id: order.id },
        data: {
          downpaymentAmount: decimal(Math.max(restored, 0)),
          remainingBalance: decimal(order.remainingBalance.toNumber() + payment.amount.toNumber()),
        },
      });
    }

    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: {
        resolutionAction: input.action,
        resolutionNote: input.note,
        resolvedById: actor.userId,
        resolvedAt: now,
        ...(input.action === "CONFIRMED_CORRECT"
          ? { reviewStatus: "VERIFIED" as const, verifiedAt: now }
          : { status: "VOIDED" as const, voidReason: input.note, voidedById: actor.userId, voidedAt: now }),
      },
      include: PAYMENT_INCLUDE,
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  await recordAuditLog({
    category: "Receipt Verification",
    action: input.action === "VOIDED" ? "Payment Voided" : "Payment Receipt Confirmed Correct",
    actorId: actor.userId,
    reference: result.receiptNumber,
    locationLabel: result.location.name,
    details: `${PAYMENT_KIND_LABELS[result.kind]} of ₱${result.amount.toNumber().toLocaleString("en-PH", { minimumFractionDigits: 2 })}. ${input.note}`,
    facts: [
      { label: "Receipt number", value: result.receiptNumber },
      { label: "Payment", value: `₱${result.amount.toNumber().toLocaleString("en-PH", { minimumFractionDigits: 2 })}` },
      { label: "Order", value: result.order?.reference ?? "-" },
      { label: "Balance after resolution", value: result.order ? `₱${result.order.remainingBalance.toNumber().toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "-" },
    ],
  });
  return serializePayment(result);
}

export function paymentsErrorResponse(error: unknown, context: string) {
  if (error instanceof PaymentError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error instanceof z.ZodError) {
    return Response.json({ error: { code: "INVALID_INPUT", message: error.issues[0]?.message ?? "Invalid input" } }, { status: 400 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
    return Response.json({ error: { code: "CONFLICT", message: "This payment changed; reload and try again" } }, { status: 409 });
  }
  console.error(context, error);
  return null;
}
