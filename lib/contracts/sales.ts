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
  /**
   * Filled in when the sale is read, not when the comparison is stored: what
   * Accounting types off the photo is the item code, and the name is only the
   * readable form of it. Deriving it also names the items on comparisons that
   * were saved before this.
   */
  name: z.string().trim().max(200).optional(),
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

export const BRANCH_MISMATCH_RESPONSES = [
  "ORIGINAL_ENCODING_CORRECT",
  "RECEIPT_CORRECTION_NEEDED",
  "WRONG_RECEIPT_PHOTO",
  "SALE_ENCODED_INCORRECT",
] as const;
export type BranchMismatchResponseDto =
  (typeof BRANCH_MISMATCH_RESPONSES)[number];

export const ACCOUNTING_RESOLUTION_ACTIONS = [
  "CONFIRMED_CORRECT",
  "VOIDED_REPLACED",
  "VOIDED",
] as const;
export type AccountingResolutionActionDto =
  (typeof ACCOUNTING_RESOLUTION_ACTIONS)[number];

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

/** How far back a branch may date a receipt it is encoding late. */
export const MAX_BACKDATED_SALE_DAYS = 365;

/**
 * The day the goods changed hands. A branch encoding a receipt days later
 * dates it by hand; a sale encoded on the spot simply leaves it out. The sale
 * cannot be dated into the future, because nothing has been sold yet.
 */
export const soldAtSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date.")
  // Date.parse rolls an impossible day over — 2026-02-31 becomes 3 March — so
  // the parsed date has to read back as the very day that was typed.
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, "That is not a real date.")
  .optional();

export function soldAtBounds(now: Date = new Date()) {
  const latest = new Date(now);
  const earliest = new Date(now);
  earliest.setDate(earliest.getDate() - MAX_BACKDATED_SALE_DAYS);
  return { earliest, latest };
}

export const directSaleRequestSchema = z.object({
  receiptBooklet: receiptBookletSchema,
  manualReceiptNumber: manualReceiptNumberSchema,
  soldAt: soldAtSchema,
  salespersonId: z.string().trim().min(1, "Select a salesperson."),
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
});
export type AccountingReviewRequest = z.infer<typeof accountingReviewRequestSchema>;

export const SALE_CORRECTION_REQUEST_REASONS = [
  "ACCIDENTAL_SUBMISSION",
  "DUPLICATE_SUBMISSION",
  "WRONG_INFORMATION",
  "SALE_DID_NOT_HAPPEN",
  "OTHER",
] as const;
export type SaleCorrectionRequestReasonDto =
  (typeof SALE_CORRECTION_REQUEST_REASONS)[number];

export const branchSaleCorrectionRequestSchema = z.object({
  reason: z.enum(SALE_CORRECTION_REQUEST_REASONS),
  note: z.string().trim().min(1).max(5_000),
});
export type BranchSaleCorrectionRequest = z.infer<
  typeof branchSaleCorrectionRequestSchema
>;

export const saleCorrectionResolutionSchema = z.object({
  correctionRequestId: z.string().min(1),
  action: z.enum(["KEEP_SALE", "VOID_SALE"]),
  note: z.string().trim().min(1).max(5_000),
});
export type SaleCorrectionResolution = z.infer<
  typeof saleCorrectionResolutionSchema
>;

export type SaleCorrectionRequestDto = {
  id: string;
  reason: SaleCorrectionRequestReasonDto;
  note: string;
  status: "PENDING" | "RESOLVED";
  resolution: "KEPT" | "VOIDED" | null;
  resolutionNote: string | null;
  requestedBy: string;
  requestedAt: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
};

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
  source: "Customer Order" | "Direct Sale";
  manualReceiptNumber: string;
  receiptBooklet: string;
  version: number;
  branch: string;
  branchId: string;
  customer: string;
  totalAmount: number;
  discountAmount: number;
  amountPaid: number;
  paymentMethod: z.infer<typeof paymentMethodSchema>;
  status: "POSTED" | "VOIDED";
  postedAt: string;
  soldAt: string;
  postedBy: string;
  salesperson: import("./personnel").SalespersonSnapshotDto | null;
  reviewStatus: ReviewStatusDto;
  mismatchCategory: string | null;
  reviewNotes: string | null;
  reportedComparison: ReceiptComparison | null;
  branchResponse: BranchMismatchResponseDto | null;
  branchResponseNote: string | null;
  branchReplacementReceiptNumber: string | null;
  branchRespondedAt: string | null;
  receiptPhotoUrl: string | null;
  reviewedAt: string | null;
  resolutionAction: AccountingResolutionActionDto | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  correctionRequest: SaleCorrectionRequestDto | null;
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
