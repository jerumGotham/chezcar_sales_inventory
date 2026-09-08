import { z } from "zod";

import type { CapabilityId } from "@/lib/contracts/roles";

export const supplierClaimStatuses = ["DRAFT", "PENDING", "WAITING_REPLACEMENT", "PARTIAL", "REPLACEMENT_RECEIVED", "REJECTED", "COMPLETED", "CANCELLED"] as const;
export const supplierClaimLineReasons = ["DAMAGE", "DEFECT", "INCOMPLETE", "WRONG_ITEM", "WARRANTY"] as const;
export const supplierClaimActions = ["submit", "wait-replacement", "return-to-supplier", "send-repair", "receive-replacement", "release-repaired", "receive-repaired", "writeoff", "reject", "complete", "cancel"] as const;
export type SupplierClaimAction = typeof supplierClaimActions[number];

export const supplierClaimStatusLabels: Record<string, string> = {
  DRAFT: "Draft", PENDING: "Pending resolution", WAITING_REPLACEMENT: "Waiting for replacement",
  PARTIAL: "Partly resolved", REPLACEMENT_RECEIVED: "Replacement received", REJECTED: "Rejected",
  COMPLETED: "Completed", CANCELLED: "Cancelled",
};
export const supplierClaimReasonLabels: Record<string, string> = {
  DAMAGE: "Damaged item", DEFECT: "Defective item", INCOMPLETE: "Missing delivery items",
  WRONG_ITEM: "Wrong item delivered", WARRANTY: "Customer warranty",
};
export const supplierClaimActionLabels: Record<SupplierClaimAction, string> = {
  submit: "Submit claim", "wait-replacement": "Mark waiting for replacement", reject: "Record claim rejection",
  complete: "Complete claim", cancel: "Cancel draft", "return-to-supplier": "Return items to supplier",
  "send-repair": "Send items out for repair", "receive-replacement": "Receive replacement items",
  "release-repaired": "Make repaired items sellable", "receive-repaired": "Receive repaired items",
  writeoff: "Write off held items",
};

export const supplierClaimActionCapabilities = {
  submit: "supplier-claims:manage",
  "wait-replacement": "supplier-claims:manage",
  "return-to-supplier": "supplier-claims:return-stock",
  "send-repair": "supplier-claims:repair-stock",
  "receive-replacement": "supplier-claims:receive-replacement",
  "release-repaired": "supplier-claims:repair-stock",
  "receive-repaired": "supplier-claims:repair-stock",
  writeoff: "supplier-claims:approve-writeoff",
  reject: "supplier-claims:close",
  complete: "supplier-claims:close",
  cancel: "supplier-claims:close",
} as const satisfies Record<SupplierClaimAction, CapabilityId>;

export const supplierClaimListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(supplierClaimStatuses).optional(),
});

const lineSchema = z.object({
  productId: z.string().min(1),
  reason: z.enum(supplierClaimLineReasons),
  quarantinedQuantity: z.number().int().min(0),
  missingQuantity: z.number().int().min(0),
  unitCost: z.number().positive().multipleOf(0.01),
  notes: z.string().trim().max(1_000).optional(),
}).refine((line) => line.quarantinedQuantity + line.missingQuantity > 0, "Claimed quantity must be greater than zero.");

export const createSupplierClaimSchema = z.object({
  idempotencyKey: z.string().min(8).max(100),
  supplierId: z.string().min(1),
  locationId: z.string().min(1),
  sourceReceiptId: z.string().min(1).optional(),
  customerWarrantyId: z.string().min(1).optional(),
  notes: z.string().trim().max(4_000).optional(),
  targetDate: z.string().datetime().optional(),
  lines: z.array(lineSchema).min(1).max(50),
});

export const supplierClaimActionSchema = z.object({
  version: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(100),
  notes: z.string().trim().max(4_000).optional(),
  targetDate: z.string().datetime().optional(),
  lines: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().positive() })).max(50).default([]),
}).superRefine((input, context) => {
  const seen = new Set<string>();
  input.lines.forEach((line, index) => {
    if (seen.has(line.productId)) context.addIssue({ code: "custom", path: ["lines", index, "productId"], message: "Each product can only appear once." });
    seen.add(line.productId);
  });
});

export const supplierClaimSettlementSchema = z.object({
  idempotencyKey: z.string().min(8).max(100),
  type: z.enum(["REFUND", "CREDIT"]),
  amount: z.number().positive(),
  currency: z.string().trim().length(3).default("PHP"),
  reference: z.string().trim().min(1).max(100),
  notes: z.string().trim().max(4_000).optional(),
  lines: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().positive() })).min(1).max(50),
}).superRefine((input, context) => {
  const seen = new Set<string>();
  input.lines.forEach((line, index) => {
    if (seen.has(line.productId)) context.addIssue({ code: "custom", path: ["lines", index, "productId"], message: "Each product can only appear once." });
    seen.add(line.productId);
  });
});

export type CreateSupplierClaimInput = z.infer<typeof createSupplierClaimSchema>;
export type SupplierClaimActionInput = z.infer<typeof supplierClaimActionSchema>;
export type SupplierClaimSettlementInput = z.infer<typeof supplierClaimSettlementSchema>;
