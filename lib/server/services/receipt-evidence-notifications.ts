import "server-only";

import { Prisma } from "@prisma/client";

import { assertCapability, AuthorizationError, type AuthContext } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { canAccessLocation } from "@/lib/server/policy/access";
import { recordAuditLog } from "./audit-log";
import { createNotifications } from "./notifications";
import { CustomerSalesError } from "./customer-sales";

const MANILA_OFFSET_HOURS = 8;

function reminderCutoff(now: Date) {
  const configured = process.env.RECEIPT_EVIDENCE_REMINDER_TIME ?? "19:00";
  const match = /^(\d{2}):(\d{2})$/.exec(configured);
  const hour = match ? Number(match[1]) : 19;
  const minute = match ? Number(match[2]) : 0;
  const safeHour = hour >= 0 && hour <= 23 ? hour : 19;
  const safeMinute = minute >= 0 && minute <= 59 ? minute : 0;
  const manilaNow = new Date(now.getTime() + MANILA_OFFSET_HOURS * 60 * 60 * 1000);
  let cutoff = new Date(Date.UTC(
    manilaNow.getUTCFullYear(),
    manilaNow.getUTCMonth(),
    manilaNow.getUTCDate(),
    safeHour - MANILA_OFFSET_HOURS,
    safeMinute,
  ));
  if (cutoff > now) cutoff = new Date(cutoff.getTime() - 24 * 60 * 60 * 1000);
  return cutoff;
}

async function branchRecipients(tx: Prisma.TransactionClient, sale: { postedById: string; locationId: string }) {
  const users = await tx.user.findMany({
    where: {
      status: "ACTIVE",
      accessRole: { permissions: { has: "sales:mismatch:respond" } },
      locationAssignments: { some: { locationId: sale.locationId } },
    },
    select: { id: true },
  });
  return Array.from(new Set([sale.postedById, ...users.map((user) => user.id)]));
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

export async function notifyReceiptEvidencePending(actor: AuthContext, saleId: string) {
  assertCapability(actor, "sales:evidence:upload");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: { accountingReview: true },
    });
    if (!sale) throw new CustomerSalesError("NOT_FOUND", "Sale not found", 404);
    if (!canAccessLocation(actor, sale.locationId)) throw new AuthorizationError("Insufficient permissions");
    if (sale.accountingReview?.receiptPhotoKey || sale.accountingReview?.evidencePendingNotifiedAt) return { pending: false };
    await tx.saleAccountingReview.update({
      where: { saleId },
      data: { evidencePendingNotifiedAt: new Date() },
    });
    const recipients = await branchRecipients(tx, sale);
    await createNotifications(tx, recipients.map((userId) => ({
      userId,
      title: "Receipt evidence pending",
      description: `Attach the handwritten receipt photo for ${sale.manualReceiptNumber}.`,
      type: "WARNING" as const,
      relatedType: "SALE" as const,
      relatedId: sale.id,
      relatedReference: sale.reference,
    })));
    return { pending: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/*
 * Who is told that a payment receipt has no photo: the person who took the
 * money, anyone at that branch who can attach one, and the owners and
 * all-branch administrators, so a branch that has nobody on shift is not the
 * end of the line.
 */
async function paymentEvidenceRecipients(
  tx: Prisma.TransactionClient,
  payment: { collectedById: string; locationId: string },
) {
  const branch = await tx.user.findMany({
    where: {
      status: "ACTIVE",
      /*
       * Either grant marks somebody as the branch side of a receipt problem.
       * Attaching the photo is the obvious one, but a branch whose role only
       * answers mismatches still needs to hear that a receipt is holding up
       * verification.
       */
      accessRole: {
        OR: [
          { permissions: { has: "sales:evidence:upload" } },
          { permissions: { has: "sales:mismatch:respond" } },
        ],
      },
      locationAssignments: { some: { locationId: payment.locationId } },
    },
    select: { id: true },
  });
  const administrators = await tx.user.findMany({
    where: {
      status: "ACTIVE",
      accessRole: { OR: [{ isOwner: true }, { permissions: { has: "locations:all" } }] },
    },
    select: { id: true },
  });
  return Array.from(new Set([
    payment.collectedById,
    ...branch.map((user) => user.id),
    ...administrators.map((user) => user.id),
  ]));
}

/**
 * Asks the branch for the photo of a payment receipt that has none. Sent by
 * whoever verifies receipts, and only once: a second press reports that the
 * branch has already been asked rather than sending the nudge again.
 */
export async function notifyPaymentEvidencePending(actor: AuthContext, paymentId: string) {
  assertCapability(actor, "sales:verify");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new CustomerSalesError("NOT_FOUND", "Payment receipt not found", 404);
    if (!canAccessLocation(actor, payment.locationId)) throw new AuthorizationError("Insufficient permissions");
    if (payment.status !== "ACTIVE") {
      throw new CustomerSalesError("INVALID_STATE", "This payment was voided, so there is nothing to attach", 409);
    }
    if (payment.receiptPhotoKey) {
      throw new CustomerSalesError("EVIDENCE_PRESENT", "This receipt already has a photo attached", 409);
    }
    if (payment.evidencePendingNotifiedAt) {
      return { notified: false, notifiedAt: payment.evidencePendingNotifiedAt.toISOString() };
    }
    const now = new Date();
    await tx.payment.update({ where: { id: paymentId }, data: { evidencePendingNotifiedAt: now } });
    const recipients = await paymentEvidenceRecipients(tx, payment);
    await createNotifications(tx, recipients.map((userId) => ({
      userId,
      title: "Payment receipt photo needed",
      description: `Attach the photo of receipt ${payment.receiptNumber} so Accounting can verify it.`,
      type: "WARNING" as const,
      relatedType: "PAYMENT" as const,
      relatedId: payment.id,
      relatedReference: payment.reference,
    })));
    await recordAuditLog({
      category: "Receipt Verification",
      action: "Payment Receipt Photo Requested",
      actorId: actor.userId,
      reference: payment.receiptNumber,
      details: `Asked the branch and the administrators for the missing receipt photo`,
      facts: [
        { label: "Payment", value: payment.reference },
        { label: "Amount", value: String(payment.amount.toNumber()) },
        { label: "People notified", value: String(recipients.length) },
      ],
    }, tx);
    return { notified: true, notifiedAt: now.toISOString(), recipients: recipients.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function notifyReceiptEvidenceUploaded(saleId: string, expectedKey?: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
    const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { accountingReview: true } });
    if (!sale?.accountingReview?.receiptPhotoKey || sale.status !== "POSTED" || sale.accountingReview.status !== "UNVERIFIED") return;
    if (expectedKey && sale.accountingReview.receiptPhotoKey !== expectedKey) return;
    if (!sale.accountingReview.evidenceUploadedAt) {
      await tx.saleAccountingReview.update({ where: { saleId }, data: { evidenceUploadedAt: new Date() } });
    }
    const recipients = await accountingRecipients(tx, sale.locationId);
    await createNotifications(tx, recipients.map(({ id: userId }) => ({
      userId,
      title: "Receipt evidence uploaded",
      description: `Receipt ${sale.manualReceiptNumber} is ready for Accounting review.`,
      type: "INFO" as const,
      relatedType: "SALE" as const,
      relatedId: sale.id,
      relatedReference: sale.reference,
    })));
  });
}

export async function notifyReceiptEvidenceDeleted(
  tx: Prisma.TransactionClient,
  actor: AuthContext,
  sale: { id: string; postedById: string; locationId: string; manualReceiptNumber: string; reference: string },
) {
  const branch = await branchRecipients(tx, sale);
  const accounting = await accountingRecipients(tx, sale.locationId);
  const recipients = new Set([actor.userId, ...branch, ...accounting.map((user) => user.id)]);
  await createNotifications(tx, Array.from(recipients, (userId) => ({
    userId,
    title: "Receipt photo deleted",
    description: `User ${actor.userId} deleted the unreviewed photo for receipt ${sale.manualReceiptNumber}. A new photo is required before Accounting review.`,
    type: "WARNING" as const,
    relatedType: "SALE" as const,
    relatedId: sale.id,
    relatedReference: sale.reference,
  })));
}

export async function createDueReceiptEvidenceReminders(now = new Date()) {
  const due = await prisma.saleAccountingReview.findMany({
    where: {
      receiptPhotoKey: null,
      evidenceReminderSentAt: null,
      sale: {
        status: "POSTED",
        postedAt: { lte: reminderCutoff(now) },
        correctionRequests: { none: { status: "PENDING" } },
      },
    },
    select: { id: true, saleId: true },
    take: 100,
  });
  for (const candidate of due) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${candidate.saleId} FOR UPDATE`;
      const actionable = await tx.saleAccountingReview.findUnique({
        where: { id: candidate.id },
        select: {
          receiptPhotoKey: true,
          evidenceReminderSentAt: true,
          sale: {
            select: {
              status: true,
              correctionRequests: { where: { status: "PENDING" }, take: 1, select: { id: true } },
            },
          },
        },
      });
      if (
        !actionable ||
        actionable.receiptPhotoKey ||
        actionable.evidenceReminderSentAt ||
        actionable.sale.status !== "POSTED" ||
        actionable.sale.correctionRequests.length > 0
      ) return;
      const claimed = await tx.saleAccountingReview.updateMany({
        where: { id: candidate.id, receiptPhotoKey: null, evidenceReminderSentAt: null },
        data: { evidenceReminderSentAt: now },
      });
      if (claimed.count !== 1) return;
      const review = await tx.saleAccountingReview.findUniqueOrThrow({
        where: { id: candidate.id },
        include: { sale: true },
      });
      const recipients = await branchRecipients(tx, review.sale);
      await createNotifications(tx, recipients.map((userId) => ({
        userId,
        title: "End-of-shift receipt reminder",
        description: `Receipt ${review.sale.manualReceiptNumber} still needs a handwritten receipt photo.`,
        type: "WARNING" as const,
        relatedType: "SALE" as const,
        relatedId: review.sale.id,
        relatedReference: review.sale.reference,
      })));
    });
  }
}
