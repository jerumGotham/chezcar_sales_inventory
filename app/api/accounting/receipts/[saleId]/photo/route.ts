import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  AuthorizationError,
  assertCapability,
  authorizationErrorResponse,
  requireCapability,
  type AuthContext,
} from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { CustomerSalesError } from "@/lib/server/services/customer-sales";
import { canAccessLocation } from "@/lib/server/policy/access";
import {
  readReceiptEvidence,
  receiptEvidenceVersion,
  removeReceiptEvidence,
  saveReceiptEvidence,
} from "@/lib/server/services/receipt-evidence";
import { notifyReceiptEvidenceDeleted, notifyReceiptEvidenceUploaded } from "@/lib/server/services/receipt-evidence-notifications";

type Context = { params: Promise<{ saleId: string }> };

async function assertEvidenceScope(actor: AuthContext, saleId: string, db: Pick<Prisma.TransactionClient, "sale"> = prisma) {
  const sale = await db.sale.findUnique({
    where: { id: saleId },
    select: { id: true, locationId: true, status: true, postedById: true, manualReceiptNumber: true, reference: true },
  });
  if (!sale) throw new CustomerSalesError("NOT_FOUND", "Sale not found", 404);
  if (!canAccessLocation(actor, sale.locationId)) {
    throw new AuthorizationError("Insufficient permissions");
  }
  return sale;
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:evidence:upload");
    const { saleId } = await context.params;
    const sale = await assertEvidenceScope(actor, saleId);
    if (sale.status !== "POSTED") {
      throw new CustomerSalesError("INVALID_STATE", "Receipt evidence can be changed only on a posted sale", 409);
    }
    const review = await prisma.saleAccountingReview.findUnique({
      where: { saleId },
      select: { id: true, status: true, reviewedAt: true, resolvedAt: true, branchRespondedAt: true, receiptPhotoKey: true },
    });
    if (!review) throw new CustomerSalesError("NOT_FOUND", "Accounting review not found", 404);
    if (review.status === "VERIFIED" || review.resolvedAt) {
      throw new CustomerSalesError("INVALID_STATE", "Receipt evidence cannot be changed after review", 409);
    }
    const formData = await request.formData();
    const file = formData.get("photo");
    if (!(file instanceof File)) throw new CustomerSalesError("INVALID_INPUT", "Receipt photo is required", 400);
    const purpose = formData.get("purpose");
    if (purpose !== null && purpose !== "branch-finding-replacement") {
      throw new CustomerSalesError(
        "INVALID_INPUT",
        "Receipt photo purpose is invalid",
        400,
      );
    }
    const isBranchFindingReplacement = purpose === "branch-finding-replacement";
    if (review.status === "MISMATCH_REPORTED" && !isBranchFindingReplacement) {
      throw new CustomerSalesError(
        "INVALID_STATE",
        "Use the Branch Finding replacement flow to replace evidence for a reported mismatch",
        409,
      );
    }
    if (isBranchFindingReplacement) {
      assertCapability(actor, "sales:mismatch:respond");
      if (review.status !== "MISMATCH_REPORTED") {
        throw new CustomerSalesError(
          "INVALID_STATE",
          "A Branch Finding replacement photo requires an unresolved receipt mismatch",
          409,
        );
      }
    }
    const evidence = await saveReceiptEvidence(file);
    try {
      await prisma.$transaction(async (tx) => {
        // Use the same Sale -> review lock order as review, branch response, and void.
        await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
        const currentSale = await assertEvidenceScope(actor, saleId, tx);
        if (currentSale.status !== "POSTED") {
          throw new CustomerSalesError("INVALID_STATE", "Receipt evidence can be changed only on a posted sale", 409);
        }
        const updated = await tx.saleAccountingReview.updateMany({
          where: {
            id: review.id,
            status: isBranchFindingReplacement ? "MISMATCH_REPORTED" : "UNVERIFIED",
            resolvedAt: null,
            reviewedAt: review.reviewedAt,
            branchRespondedAt: review.branchRespondedAt,
            receiptPhotoKey: review.receiptPhotoKey,
          },
          data: {
            receiptPhotoKey: evidence.key,
            receiptPhotoType: evidence.contentType,
            evidenceUploadedAt: new Date(Math.max(Date.now(), (review.reviewedAt?.getTime() ?? 0) + 1)),
            receiptOcrStatus: null,
            receiptOcrJson: null,
            receiptOcrError: null,
            receiptOcrAt: null,
            ...(isBranchFindingReplacement
              ? {
                  branchResponse: null,
                  branchResponseNote: null,
                  branchReplacementReceiptNumber: null,
                  branchRespondedById: null,
                  branchRespondedAt: null,
                }
              : {}),
          },
        });
        if (updated.count !== 1) {
          throw new CustomerSalesError("INVALID_STATE", "Receipt evidence changed; reload before uploading", 409);
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      // A lost commit response must not cause removal of an attached image.
      await prisma.saleAccountingReview.count({ where: { receiptPhotoKey: evidence.key } }).then(async (references) => {
        if (references === 0) await removeReceiptEvidence(evidence.key);
      }).catch((cleanupError) => {
        console.error("Unable to remove uncommitted receipt evidence", cleanupError);
      });
      throw error;
    }
    if (review.receiptPhotoKey && review.receiptPhotoKey !== evidence.key) {
      await removeReceiptEvidence(review.receiptPhotoKey).catch((cleanupError) => {
        console.error("Unable to remove replaced receipt evidence", cleanupError);
      });
    }
    if (review.status === "UNVERIFIED") {
      await notifyReceiptEvidenceUploaded(saleId, evidence.key).catch((notificationError) => {
        console.error("Unable to notify receipt evidence upload", notificationError);
      });
    }
    return Response.json({ data: evidence });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return Response.json({ error: { code: "INVALID_STATE", message: "Receipt changed; reload before uploading" } }, { status: 409 });
    if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    if (error instanceof Error && error.message.startsWith("Receipt evidence")) return Response.json({ error: { code: "INVALID_INPUT", message: error.message } }, { status: 400 });
    return authorizationErrorResponse(error);
  }
}

export async function GET(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:evidence:view");
    const { saleId } = await context.params;
    await assertEvidenceScope(actor, saleId);
    const review = await prisma.saleAccountingReview.findUnique({ where: { saleId }, select: { receiptPhotoKey: true } });
    if (!review?.receiptPhotoKey) return new Response("Not found", { status: 404 });
    const version = new URL(request.url).searchParams.get("version");
    if (version !== null && version !== receiptEvidenceVersion(review.receiptPhotoKey)) {
      throw new CustomerSalesError("STALE_EVIDENCE", "Receipt photo changed; reload before viewing", 409);
    }
    const evidence = await readReceiptEvidence(review.receiptPhotoKey);
    return new Response(evidence.body, { headers: { "Content-Type": evidence.contentType, "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return new Response("Not found", { status: 404 });
    return authorizationErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:evidence:delete");
    const { saleId } = await context.params;
    const input = z.object({ version: z.string().regex(/^[0-9a-f]{64}$/) }).strict().safeParse(await request.json().catch(() => null));
    if (!input.success) {
      throw new CustomerSalesError("INVALID_INPUT", "The displayed receipt photo version is required", 400);
    }
    const detachedKey = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
      const sale = await assertEvidenceScope(actor, saleId, tx);
      if (sale.status !== "POSTED") {
        throw new CustomerSalesError("INVALID_STATE", "Receipt evidence can be deleted only from a posted sale", 409);
      }
      await tx.$queryRaw`SELECT id FROM "SaleAccountingReview" WHERE "saleId" = ${saleId} FOR UPDATE`;
      const review = await tx.saleAccountingReview.findUnique({ where: { saleId } });
      if (!review) throw new CustomerSalesError("NOT_FOUND", "Accounting review not found", 404);
      if (review.status !== "UNVERIFIED" || review.reviewedAt || review.verifiedAt || review.resolvedAt || review.branchResponse || review.branchRespondedAt) {
        throw new CustomerSalesError("INVALID_STATE", "Receipt evidence cannot be deleted after review or a branch finding", 409);
      }
      if (await tx.saleCorrectionRequest.findFirst({ where: { saleId, status: "PENDING" }, select: { id: true } })) {
        throw new CustomerSalesError("CORRECTION_PENDING", "Resolve the sale correction request before deleting its receipt photo", 409);
      }
      if (!review.receiptPhotoKey || input.data.version !== receiptEvidenceVersion(review.receiptPhotoKey)) {
        throw new CustomerSalesError("STALE_EVIDENCE", "Receipt photo changed; reload before deleting", 409);
      }
      const deleted = await tx.saleAccountingReview.updateMany({
        where: {
          id: review.id,
          status: "UNVERIFIED",
          reviewedAt: null,
          verifiedAt: null,
          resolvedAt: null,
          branchResponse: null,
          branchRespondedAt: null,
          receiptPhotoKey: review.receiptPhotoKey,
          sale: { status: "POSTED", correctionRequests: { none: { status: "PENDING" } } },
        },
        data: {
          receiptPhotoKey: null,
          receiptPhotoType: null,
          receiptOcrStatus: null,
          receiptOcrJson: null,
          receiptOcrError: null,
          receiptOcrAt: null,
          evidenceUploadedAt: null,
          evidencePendingNotifiedAt: null,
          evidenceReminderSentAt: null,
        },
      });
      if (deleted.count !== 1) {
        throw new CustomerSalesError("INVALID_STATE", "Receipt evidence changed; reload before deleting", 409);
      }
      await notifyReceiptEvidenceDeleted(tx, actor, sale);
      return review.receiptPhotoKey;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await removeReceiptEvidence(detachedKey).catch((cleanupError) => {
      console.error("Unable to remove detached receipt evidence", cleanupError);
    });
    return Response.json({ data: { deleted: true } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return Response.json({ error: { code: "INVALID_STATE", message: "Receipt changed; reload before deleting" } }, { status: 409 });
    if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    return authorizationErrorResponse(error);
  }
}
