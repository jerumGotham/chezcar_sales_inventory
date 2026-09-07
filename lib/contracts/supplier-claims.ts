import { z } from "zod";

export const supplierClaimStatuses = ["DRAFT", "PENDING", "WAITING_REPLACEMENT", "PARTIAL", "REPLACEMENT_RECEIVED", "REJECTED", "COMPLETED", "CANCELLED"] as const;
export const supplierClaimLineReasons = ["DAMAGE", "DEFECT", "INCOMPLETE", "WRONG_ITEM", "WARRANTY"] as const;
export const supplierClaimActions = ["submit", "wait-replacement", "return-to-supplier", "send-repair", "receive-replacement", "release-repaired", "receive-repaired", "writeoff", "reject", "complete", "cancel"] as const;

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
  unitCost: z.number().positive(),
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
});

export const supplierClaimSettlementSchema = z.object({
  idempotencyKey: z.string().min(8).max(100),
  type: z.enum(["REFUND", "CREDIT"]),
  amount: z.number().positive(),
  currency: z.string().trim().length(3).default("PHP"),
  reference: z.string().trim().min(1).max(100),
  notes: z.string().trim().max(4_000).optional(),
});

export type CreateSupplierClaimInput = z.infer<typeof createSupplierClaimSchema>;
export type SupplierClaimAction = typeof supplierClaimActions[number];
export type SupplierClaimActionInput = z.infer<typeof supplierClaimActionSchema>;
export type SupplierClaimSettlementInput = z.infer<typeof supplierClaimSettlementSchema>;
