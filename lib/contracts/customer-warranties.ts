import { z } from "zod";

const optionalText = z.string().trim().max(2_000).optional();
const optionalRequiredText = z.preprocess((value) => value === "" ? undefined : value, z.string().trim().min(1).max(2_000).optional());
const optionalPositiveInt = z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().int().positive().max(1_200).optional());

// Browsers send an unnamed, empty File for an unselected multipart file input.
export const warrantyCreatePhotoSchema = z.preprocess(
  (value) => value === null || (value instanceof File && value.name === "" && value.size === 0) ? undefined : value,
  z.instanceof(File, { message: "Choose an image file for the intake photo" }).optional(),
);

export const warrantyStatusLabels: Record<string, string> = {
  ASSESSMENT: "For assessment", APPROVED_REPAIR: "Repair approved", APPROVED_REPLACEMENT: "Replacement approved",
  WAITING_STOCK: "Waiting for stock", READY: "Ready for pickup", RELEASED: "Handed to customer",
  COMPLETED: "Completed", REJECTED: "Rejected", CANCELLED: "Cancelled",
};

export const warrantyCreateFieldsSchema = z.object({
  idempotencyKey: z.string().uuid(),
  locationId: z.string().min(1),
  saleLineId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  claimQuantity: z.coerce.number().int().positive(),
  concern: z.string().trim().min(1).max(2_000),
  warrantyBasisMonths: optionalPositiveInt,
  warrantyBasisReason: optionalRequiredText,
  quantityOverrideReason: optionalRequiredText,
  legacyCustomerName: z.string().trim().min(1).max(200).optional(),
  legacySaleReference: z.string().trim().max(200).optional(),
  legacyReason: z.string().trim().min(1).max(2_000).optional(),
}).superRefine((input, context) => {
  const legacy = Boolean(input.legacyReason);
  if (legacy && (!input.productId || !input.legacyCustomerName)) context.addIssue({ code: "custom", message: "Enter the customer and product for a claim without a system sale" });
  if (!legacy && !input.saleLineId) context.addIssue({ code: "custom", message: "Select an item from a verified sale" });
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

export const returnWarrantyToCustomerSchema = warrantyActionSchema.extend({
  quantity: z.number().int().positive(),
  notes: z.string().trim().min(1).max(2_000),
});

export const warrantyListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["ASSESSMENT", "APPROVED_REPAIR", "APPROVED_REPLACEMENT", "WAITING_STOCK", "READY", "RELEASED", "COMPLETED", "REJECTED", "CANCELLED"]).optional(),
});

export type WarrantyCreateFields = z.infer<typeof warrantyCreateFieldsSchema>;
export type WarrantyActionInput = z.infer<typeof warrantyActionSchema>;
