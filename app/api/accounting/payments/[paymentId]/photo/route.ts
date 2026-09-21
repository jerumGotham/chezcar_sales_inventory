import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  AuthorizationError,
  authorizationErrorResponse,
  requireCapability,
  type AuthContext,
} from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { canAccessLocation } from "@/lib/server/policy/access";
import { recordAuditLog } from "@/lib/server/services/audit-log";
import {
  readReceiptEvidence,
  receiptEvidenceVersion,
  removeReceiptEvidence,
  saveReceiptEvidence,
} from "@/lib/server/services/receipt-evidence";
import { notifyPaymentEvidenceUploaded, PaymentError } from "@/lib/server/services/payments";

type Context = { params: Promise<{ paymentId: string }> };

async function scopedPayment(actor: AuthContext, paymentId: string, db: Pick<Prisma.TransactionClient, "payment"> = prisma) {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      reference: true,
      locationId: true,
      status: true,
      saleId: true,
      receiptNumber: true,
      receiptPhotoKey: true,
      reviewStatus: true,
      reviewedAt: true,
      resolvedAt: true,
      collectedById: true,
    },
  });
  if (!payment) throw new PaymentError("NOT_FOUND", "Payment not found", 404);
  if (!canAccessLocation(actor, payment.locationId)) throw new AuthorizationError("Insufficient permissions");
  // A receipt that settles a sale is evidenced through that sale's own photo.
  if (payment.saleId) throw new PaymentError("INVALID_STATE", "This receipt is evidenced with its sale", 409);
  return payment;
}

function errorResponse(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
    return Response.json({ error: { code: "CONFLICT", message: "This payment changed; reload and try again" } }, { status: 409 });
  }
  if (error instanceof PaymentError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  if (error instanceof Error && error.message.startsWith("Receipt evidence")) {
    return Response.json({ error: { code: "INVALID_INPUT", message: error.message } }, { status: 400 });
  }
  return authorizationErrorResponse(error);
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:evidence:upload");
    const { paymentId } = await context.params;
    const payment = await scopedPayment(actor, paymentId);
    if (payment.status === "VOIDED") throw new PaymentError("INVALID_STATE", "A voided payment cannot take a new photo", 409);
    if (payment.reviewStatus === "VERIFIED" || payment.resolvedAt) {
      throw new PaymentError("INVALID_STATE", "The receipt photo cannot be changed after review", 409);
    }
    const formData = await request.formData();
    const file = formData.get("photo");
    if (!(file instanceof File)) throw new PaymentError("INVALID_INPUT", "Receipt photo is required", 400);

    const evidence = await saveReceiptEvidence(file);
    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
          const current = await scopedPayment(actor, paymentId, tx);
          const updated = await tx.payment.updateMany({
            where: {
              id: current.id,
              status: "ACTIVE",
              resolvedAt: null,
              receiptPhotoKey: current.receiptPhotoKey,
              reviewStatus: current.reviewStatus,
            },
            data: {
              receiptPhotoKey: evidence.key,
              receiptPhotoType: evidence.contentType,
              evidenceUploadedAt: new Date(),
            },
          });
          if (updated.count !== 1) {
            throw new PaymentError("INVALID_STATE", "The receipt photo changed; reload before uploading", 409);
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      // A lost commit response must not delete an image the record still points at.
      await prisma.payment
        .count({ where: { receiptPhotoKey: evidence.key } })
        .then(async (references) => {
          if (references === 0) await removeReceiptEvidence(evidence.key);
        })
        .catch((cleanupError) => console.error("Unable to remove uncommitted payment evidence", cleanupError));
      throw error;
    }

    if (payment.receiptPhotoKey && payment.receiptPhotoKey !== evidence.key) {
      await removeReceiptEvidence(payment.receiptPhotoKey).catch((cleanupError) =>
        console.error("Unable to remove replaced payment evidence", cleanupError),
      );
    }
    if (payment.reviewStatus === "UNVERIFIED") {
      await notifyPaymentEvidenceUploaded(payment.id).catch((notificationError) =>
        console.error("Unable to notify payment evidence upload", notificationError),
      );
    }
    await recordAuditLog({
      category: "Receipt Verification",
      action: payment.receiptPhotoKey ? "Payment Receipt Photo Replaced" : "Payment Receipt Photo Uploaded",
      actorId: actor.userId,
      reference: payment.receiptNumber,
      details: `Receipt ${payment.receiptNumber}`,
    });
    return Response.json({ data: evidence });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:evidence:view");
    const { paymentId } = await context.params;
    const payment = await scopedPayment(actor, paymentId);
    if (!payment.receiptPhotoKey) return new Response("Not found", { status: 404 });
    const version = new URL(request.url).searchParams.get("version");
    if (version !== null && version !== receiptEvidenceVersion(payment.receiptPhotoKey)) {
      throw new PaymentError("STALE_EVIDENCE", "The receipt photo changed; reload before viewing", 409);
    }
    const evidence = await readReceiptEvidence(payment.receiptPhotoKey);
    return new Response(evidence.body, {
      headers: { "Content-Type": evidence.contentType, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return new Response("Not found", { status: 404 });
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:evidence:delete");
    const { paymentId } = await context.params;
    const input = z
      .object({ version: z.string().regex(/^[0-9a-f]{64}$/) })
      .strict()
      .safeParse(await request.json().catch(() => null));
    if (!input.success) throw new PaymentError("INVALID_INPUT", "The displayed receipt photo version is required", 400);

    const detachedKey = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
        const payment = await scopedPayment(actor, paymentId, tx);
        if (payment.reviewStatus !== "UNVERIFIED" || payment.reviewedAt || payment.resolvedAt) {
          throw new PaymentError("INVALID_STATE", "The receipt photo cannot be deleted after review", 409);
        }
        if (!payment.receiptPhotoKey || input.data.version !== receiptEvidenceVersion(payment.receiptPhotoKey)) {
          throw new PaymentError("STALE_EVIDENCE", "The receipt photo changed; reload before deleting", 409);
        }
        const deleted = await tx.payment.updateMany({
          where: {
            id: payment.id,
            reviewStatus: "UNVERIFIED",
            reviewedAt: null,
            resolvedAt: null,
            receiptPhotoKey: payment.receiptPhotoKey,
          },
          data: { receiptPhotoKey: null, receiptPhotoType: null, evidenceUploadedAt: null },
        });
        if (deleted.count !== 1) throw new PaymentError("INVALID_STATE", "The receipt photo changed; reload before deleting", 409);
        return payment.receiptPhotoKey;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await removeReceiptEvidence(detachedKey).catch((cleanupError) =>
      console.error("Unable to remove detached payment evidence", cleanupError),
    );
    await recordAuditLog({
      category: "Receipt Verification",
      action: "Payment Receipt Photo Deleted",
      actorId: actor.userId,
      reference: paymentId,
      details: "The uploaded payment receipt photo was deleted before review",
    });
    return Response.json({ data: { deleted: true } });
  } catch (error) {
    return errorResponse(error);
  }
}
