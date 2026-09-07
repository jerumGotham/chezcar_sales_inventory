import { z } from "zod";

const optionalText = z.string().trim().max(2_000).optional();

export const warrantyCreateFieldsSchema = z.object({
  idempotencyKey: z.string().uuid(),
  locationId: z.string().min(1),
  saleLineId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  claimQuantity: z.coerce.number().int().positive(),
  concern: z.string().trim().min(1).max(2_000),
  legacyCustomerName: z.string().trim().min(1).max(200).optional(),
  legacySaleReference: z.string().trim().max(200).optional(),
  legacyReason: z.string().trim().min(1).max(2_000).optional(),
}).superRefine((input, context) => {
  const legacy = Boolean(input.legacyReason);
  if (legacy && (!input.productId || !input.legacyCustomerName)) context.addIssue({ code: "custom", message: "Legacy claims require customer and product attribution" });
  if (!legacy && !input.saleLineId) context.addIssue({ code: "custom", message: "A verified sale line is required" });
});

export const warrantyActionSchema = z.object({
  idempotencyKey: z.string().uuid(),
  version: z.number().int().positive(),
  notes: optionalText,
  replacementProductId: z.string().min(1).optional(),
  replacementReason: optionalText,
  quantity: z.number().int().positive().optional(),
  targetDate: z.string().datetime().optional(),
});

export const warrantyListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["ASSESSMENT", "APPROVED_REPAIR", "APPROVED_REPLACEMENT", "WAITING_STOCK", "READY", "RELEASED", "COMPLETED", "REJECTED", "CANCELLED"]).optional(),
});

export type WarrantyCreateFields = z.infer<typeof warrantyCreateFieldsSchema>;
export type WarrantyActionInput = z.infer<typeof warrantyActionSchema>;
