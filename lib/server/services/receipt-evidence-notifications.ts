import "server-only";

import { Prisma } from "@prisma/client";

import { assertCapability, AuthorizationError, type AuthContext } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { canAccessLocation } from "@/lib/server/policy/access";
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

export async function notifyReceiptEvidenceUploaded(saleId: string) {
  await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { accountingReview: true } });
    if (!sale?.accountingReview?.receiptPhotoKey) return;
    await tx.saleAccountingReview.update({ where: { saleId }, data: { evidenceUploadedAt: new Date() } });
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
