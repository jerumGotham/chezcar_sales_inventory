import { z } from "zod";

/**
 * Client-safe refund contracts: money going back to a customer.
 *
 * Two shapes, because two different things happen:
 *
 * - A **cancelled order** is money only. An order that can still be cancelled
 *   has never released goods, and its reservation is returned by the
 *   cancellation itself, so there is nothing physical to take back.
 * - A **posted sale** — a direct sale, or a customer order that was released —
 *   is the only case where goods left the branch, so it is the only case that
 *   carries returned lines.
 *
 * A refund is dated the day the money went back, never the day of the original
 * receipt, so a period that has already been reported does not change
 * underneath. This module must never import server-only Prisma.
 */

export const REFUND_KINDS = ["CANCELLED_ORDER", "POSTED_SALE"] as const;
export type RefundKindDto = (typeof REFUND_KINDS)[number];

export const REFUND_DISPOSITIONS = ["RESELLABLE", "QUARANTINED"] as const;
export type RefundDispositionDto = (typeof REFUND_DISPOSITIONS)[number];

const DISPOSITION_LABELS: Record<RefundDispositionDto, string> = {
  RESELLABLE: "Back to sellable stock",
  QUARANTINED: "Quarantine for checking",
};

export function refundDispositionLabel(disposition: RefundDispositionDto): string {
  return DISPOSITION_LABELS[disposition];
}

export const REFUND_DISPOSITION_OPTIONS: ReadonlyArray<{
  value: RefundDispositionDto;
  label: string;
}> = REFUND_DISPOSITIONS.map((value) => ({ value, label: DISPOSITION_LABELS[value] }));

/** What the branch does with the money when an order is cancelled. */
export const CANCELLATION_SETTLEMENTS = ["FORFEITED", "REFUNDED"] as const;
export type CancellationSettlementDto = (typeof CANCELLATION_SETTLEMENTS)[number];

export const CANCELLATION_SETTLEMENT_OPTIONS: ReadonlyArray<{
  value: CancellationSettlementDto;
  label: string;
  description: string;
}> = [
  {
    value: "FORFEITED",
    label: "Forfeited - the branch keeps the money",
    description: "Sales are unchanged. The amount stays as revenue already earned.",
  },
  {
    value: "REFUNDED",
    label: "Refunded - the money goes back to the customer",
    description: "Sales are reduced by the refunded amount, dated today.",
  },
];

const money = z
  .number()
  .finite()
  .min(0)
  .max(9_999_999_999.99)
  .multipleOf(0.01, "Money values may have at most two decimal places");

export const refundMethodSchema = z.enum([
  "CASH",
  "GCASH",
  "MAYA",
  "BANK_TRANSFER",
  "CREDIT_CARD",
  "SPLIT",
]);

/**
 * Cancelling an order. `settlement` is the dropdown; everything else is
 * required only once REFUNDED is chosen, so forfeiting stays a single click.
 */
export const cancelOrderSettlementSchema = z
  .object({
    note: z.string().trim().max(1_000).optional(),
    /** Omitted means FORFEITED: the behaviour every caller had before this. */
    settlement: z.enum(CANCELLATION_SETTLEMENTS).optional(),
    refundAmount: money.optional(),
    refundMethod: refundMethodSchema.optional(),
    acknowledgementNumber: z.string().trim().max(100).optional(),
  })
  .superRefine((input, context) => {
    if (input.settlement !== "REFUNDED") return;
    if (input.refundAmount === undefined || input.refundAmount <= 0) {
      context.addIssue({
        code: "custom",
        path: ["refundAmount"],
        message: "Enter the amount being handed back.",
      });
    }
    if (!input.acknowledgementNumber) {
      context.addIssue({
        code: "custom",
        path: ["acknowledgementNumber"],
        message: "Record the acknowledgement slip number the customer signs.",
      });
    }
    if (!input.note) {
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "A refund needs a reason.",
      });
    }
  });
export type CancelOrderSettlement = z.infer<typeof cancelOrderSettlementSchema>;

export const refundLineSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  disposition: z.enum(REFUND_DISPOSITIONS),
});

/**
 * Refunding a posted sale. `scope` is the choice between taking everything
 * back and taking back only some items; `lines` is required for PARTIAL and
 * must stay inside what was actually sold, which the server re-checks.
 */
export const saleRefundSchema = z
  .object({
    scope: z.enum(["FULL", "PARTIAL"]),
    lines: z.array(refundLineSchema).max(200).default([]),
    /** Where the returned units land. Defaults to the selling branch. */
    stockLocationId: z.string().trim().max(100).optional(),
    refundMethod: refundMethodSchema.default("CASH"),
    acknowledgementNumber: z.string().trim().min(1, "Record the acknowledgement slip number.").max(100),
    reason: z.string().trim().min(1, "A refund needs a reason.").max(1_000),
    /** Only for FULL, which may be a goodwill refund with nothing returned. */
    disposition: z.enum(REFUND_DISPOSITIONS).default("RESELLABLE"),
  })
  .superRefine((input, context) => {
    if (input.scope !== "PARTIAL") return;
    if (!input.lines.length) {
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Choose at least one item being returned.",
      });
      return;
    }
    const seen = new Set<string>();
    input.lines.forEach((line, index) => {
      if (seen.has(line.productId)) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "productId"],
          message: "An item may appear only once.",
        });
      }
      seen.add(line.productId);
    });
  });
export type SaleRefundRequest = z.infer<typeof saleRefundSchema>;

/** Releasing quarantined units back into sellable stock. */
export const quarantineReleaseSchema = z.object({
  quantity: z.number().int().positive(),
  reason: z.string().trim().min(1, "Say why these units are sellable again.").max(500),
  reference: z.string().trim().max(100).optional(),
});
export type QuarantineReleaseRequest = z.infer<typeof quarantineReleaseSchema>;

export type RefundLineDto = {
  productId: string;
  itemCode: string;
  name: string;
  quantity: number;
  unitPrice: number;
  disposition: RefundDispositionDto;
};

export type RefundDto = {
  id: string;
  reference: string;
  kind: RefundKindDto;
  branch: string;
  stockBranch: string | null;
  customer: string | null;
  orderId: string | null;
  saleId: string | null;
  amount: number;
  method: z.infer<typeof refundMethodSchema>;
  acknowledgementNumber: string;
  reason: string;
  salesperson: string | null;
  refundedBy: string;
  refundedAt: string;
  lines: RefundLineDto[];
};

/**
 * What a sale still has left to give back, so a second refund cannot return
 * the same unit twice or hand back more money than was collected.
 */
export type SaleRefundableDto = {
  saleId: string;
  reference: string;
  branch: string;
  branchId: string;
  customer: string;
  soldAt: string;
  totalAmount: number;
  amountPaid: number;
  alreadyRefunded: number;
  refundableAmount: number;
  lines: Array<{
    productId: string;
    itemCode: string;
    name: string;
    quantity: number;
    unitPrice: number;
    alreadyReturned: number;
    returnableQuantity: number;
  }>;
};
