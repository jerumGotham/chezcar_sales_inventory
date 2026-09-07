import { z } from "zod";

const id = z.string().trim().min(1).max(100);
const version = z.number().int().positive();
const quantity = z.number().int().min(0);
const note = z.string().trim().max(4_000).optional();

export const backjobListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).default(""),
  status: z.enum(["ALL", "DRAFT", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "REJECTED"]).default("ALL"),
});

export const createBackjobSchema = z.discriminatedUnion("isLegacy", [
  z.object({
    isLegacy: z.literal(false),
    saleId: id,
    saleLineId: id,
    concern: z.string().trim().min(1).max(4_000),
    notes: note,
  }),
  z.object({
    isLegacy: z.literal(true),
    locationId: id,
    customerId: id,
    legacyReference: z.string().trim().min(1).max(200),
    legacyReason: z.string().trim().min(1).max(4_000),
    legacyProductDescription: z.string().trim().min(1).max(500),
    concern: z.string().trim().min(1).max(4_000),
    notes: note,
  }),
]);

export const backjobVersionSchema = z.object({ version });
export const scheduleBackjobSchema = backjobVersionSchema.extend({
  installerId: id,
  scheduledFor: z.string().datetime(),
  reason: note,
});
export const reasonBackjobSchema = backjobVersionSchema.extend({
  reason: z.string().trim().min(1).max(4_000),
});
export const coverageBackjobSchema = backjobVersionSchema.extend({
  coverage: z.enum(["COVERED", "CHARGEABLE"]),
  chargeSaleId: id.optional(),
  chargeableAmount: z.number().finite().min(0).max(9_999_999_999.99).default(0),
}).superRefine((value, context) => {
  if (value.coverage === "CHARGEABLE" && !value.chargeSaleId) {
    context.addIssue({ code: "custom", path: ["chargeSaleId"], message: "Charge sale is required" });
  }
  if (value.coverage === "COVERED" && (value.chargeSaleId || value.chargeableAmount !== 0)) {
    context.addIssue({ code: "custom", path: ["coverage"], message: "Covered work cannot have a charge sale or amount" });
  }
});
export const planBackjobPartsSchema = backjobVersionSchema.extend({
  parts: z.array(z.object({ productId: id, plannedQuantity: z.number().int().positive() })).max(100),
}).superRefine((value, context) => {
  if (new Set(value.parts.map((part) => part.productId)).size !== value.parts.length) {
    context.addIssue({ code: "custom", path: ["parts"], message: "Products must be unique" });
  }
});
export const issueBackjobPartSchema = backjobVersionSchema.extend({
  partId: id,
  quantity: z.number().int().positive(),
  balanceVersion: version,
});
export const reconcileBackjobPartSchema = backjobVersionSchema.extend({
  partId: id,
  usedQuantity: quantity,
});
export const returnBackjobPartSchema = issueBackjobPartSchema;
export const completeBackjobSchema = backjobVersionSchema.extend({
  workPerformed: z.string().trim().min(1).max(8_000),
  completionNotes: note,
  acknowledgementMethod: z.enum(["SIGNED", "VERBAL", "DECLINED"]),
  acknowledgedByName: z.string().trim().min(1).max(200),
  acknowledgementNote: note,
});

export type CreateBackjobInput = z.infer<typeof createBackjobSchema>;
export type ScheduleBackjobInput = z.infer<typeof scheduleBackjobSchema>;
export type CoverageBackjobInput = z.infer<typeof coverageBackjobSchema>;
export type PlanBackjobPartsInput = z.infer<typeof planBackjobPartsSchema>;
export type IssueBackjobPartInput = z.infer<typeof issueBackjobPartSchema>;
export type ReconcileBackjobPartInput = z.infer<typeof reconcileBackjobPartSchema>;
export type CompleteBackjobInput = z.infer<typeof completeBackjobSchema>;

export type BackjobOptionDto = {
  locations: Array<{ id: string; code: string; name: string }>;
  customers: Array<{ id: string; name: string; mobile: string | null }>;
  sales: Array<{
    id: string;
    reference: string;
    receiptNumber: string;
    customerId: string;
    customerName: string;
    locationId: string;
    lines: Array<{ id: string; productId: string; itemCode: string; name: string }>;
  }>;
};
