import { z } from "zod";

/**
 * Client-safe sales contracts: receipt identity, DTOs, and same-origin helpers.
 *
 * Receipt identity is per branch per ADR 0014 §1:
 *   locationId + receiptBooklet + manualReceiptNumber
 * Manual receipt number alone is NOT unique — different branches may reuse
 * the same booklet+number. The DB enforces @@unique([locationId, receiptBooklet, manualReceiptNumber]).
 *
 * This module must never import server-only Prisma; it is consumed by
 * both route handlers/services and browser callers. Money is represented
 * as number (Decimal(12,2) on server, serialized via toNumber()).
 */

export const receiptBookletSchema = z.string().trim().max(50).default("");
export const receiptBookletInputSchema = z.string().trim().max(50).optional().default("");
export const manualReceiptNumberSchema = z.string().trim().min(1).max(100);
export const paymentMethodSchema = z.enum(["CASH", "GCASH", "MAYA", "BANK_TRANSFER", "CREDIT_CARD", "SPLIT"]);

const receiptMoneySchema = z.number().finite().min(0).max(9_999_999_999.99).multipleOf(0.01, "Money values may have at most two decimal places");

export const receiptComparisonLineSchema = z.object({
  itemCode: z.string().trim().min(1).max(100),
  quantity: z.number().int().positive(),
  unitPrice: receiptMoneySchema,
});

export const receiptComparisonSchema = z.object({
  receiptBooklet: receiptBookletSchema,
  receiptNumber: manualReceiptNumberSchema,
  paymentMethod: paymentMethodSchema,
  discountAmount: receiptMoneySchema,
  amountPaid: receiptMoneySchema,
  totalAmount: receiptMoneySchema,
  lines: z.array(receiptComparisonLineSchema).min(1),
}).superRefine((comparison, context) => {
  const seen = new Set<string>();
  comparison.lines.forEach((line, index) => {
    if (seen.has(line.itemCode)) {
      context.addIssue({
        code: "custom",
        path: ["lines", index, "itemCode"],
        message: "An item may appear only once",
      });
    }
    seen.add(line.itemCode);
  });
});
export type ReceiptComparison = z.infer<typeof receiptComparisonSchema>;

export const REVIEW_STATUSES = ["UNVERIFIED", "VERIFIED", "MISMATCH_REPORTED"] as const;
export type ReviewStatusDto = (typeof REVIEW_STATUSES)[number];

// Placeholder mismatch enum for 02-02 — re-exported so later plans can import centrally
export const MISMATCH_CATEGORIES = [
  "PRICE_MISMATCH",
  "QUANTITY_MISMATCH",
  "ITEM_MISMATCH",
  "TOTAL_MISMATCH",
  "RECEIPT_NOT_FOUND",
  "OTHER",
] as const;
export type MismatchCategoryDto = (typeof MISMATCH_CATEGORIES)[number];

export const directSaleLineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().min(0).optional(),
});

export const directSaleRequestSchema = z.object({
  receiptBooklet: receiptBookletSchema,
  manualReceiptNumber: manualReceiptNumberSchema,
  paymentMethod: paymentMethodSchema.default("CASH"),
  amountPaid: z.number().min(0),
  notes: z.string().trim().max(1_000).optional(),
  lines: z.array(directSaleLineSchema).min(1),
  customerId: z.string().optional(),
  customer: z
    .object({
      name: z.string().trim().min(1).max(200),
      mobile: z.string().trim().max(80).optional(),
      email: z.string().trim().email().max(200).optional().or(z.literal("")),
      address: z.string().trim().max(500).optional(),
      source: z.string().trim().max(100).optional(),
      notes: z.string().trim().max(1_000).optional(),
    })
    .optional(),
});
export type DirectSaleRequest = z.infer<typeof directSaleRequestSchema>;

export const accountingReviewRequestSchema = z.object({
  status: z.enum(["VERIFIED", "MISMATCH_REPORTED"]),
  mismatchCategory: z.enum(["PRICE_MISMATCH", "QUANTITY_MISMATCH", "ITEM_MISMATCH", "TOTAL_MISMATCH", "RECEIPT_NOT_FOUND", "OTHER"]).optional(),
  notes: z.string().trim().max(5_000).optional(),
  comparison: receiptComparisonSchema,
  receiptPhotoKey: z.string().trim().max(200).optional(),
});
export type AccountingReviewRequest = z.infer<typeof accountingReviewRequestSchema>;

export type SaleLineDto = {
  productId: string;
  itemCode: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

export type SaleDto = {
  id: string;
  reference: string;
  manualReceiptNumber: string;
  receiptBooklet: string;
  version: number;
  branch: string;
  customer: string;
  totalAmount: number;
  discountAmount: number;
  amountPaid: number;
  paymentMethod: z.infer<typeof paymentMethodSchema>;
  status: "POSTED" | "VOIDED";
  postedAt: string;
  postedBy: string;
  reviewStatus: ReviewStatusDto;
  mismatchCategory: string | null;
  reviewNotes: string | null;
  receiptPhotoUrl: string | null;
  reviewedAt: string | null;
  resolutionAction: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  lines: SaleLineDto[];
};

export type SalesListResponseDto = { data: SaleDto[] };
export type SaleResponseDto = { data: SaleDto };
export type ApiErrorBody = { error?: { code?: string; message?: string } };

export class SalesApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "SalesApiError";
  }
}

async function salesFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let code = "REQUEST_FAILED";
    let message = "The sales request could not be completed.";
    try {
      const body = (await response.json()) as ApiErrorBody;
      if (body.error) {
        code = body.error.code ?? code;
        message = body.error.message ?? message;
      }
    } catch {
      // keep fallback
    }
    throw new SalesApiError(response.status, code, message);
  }
  return (await response.json()) as T;
}

export function listSales(): Promise<SalesListResponseDto> {
  return salesFetch<SalesListResponseDto>("/api/sales");
}

export function getSale(saleId: string): Promise<SaleResponseDto> {
  return salesFetch<SaleResponseDto>(`/api/sales/${encodeURIComponent(saleId)}`);
}

export async function postDirectSale(request: DirectSaleRequest): Promise<SaleDto> {
  const response = await salesFetch<SaleResponseDto>("/api/sales", {
    method: "POST",
    body: JSON.stringify(request),
  });
  return response.data;
}

export async function verifySale(saleId: string, request: AccountingReviewRequest): Promise<{ status: string }> {
  const response = await salesFetch<{ data: { status: string } }>(`/api/sales/${encodeURIComponent(saleId)}/review`, {
    method: "POST",
    body: JSON.stringify(request),
  });
  return response.data;
}
