import { z } from "zod";

const positiveInt = z.number().int().positive();

/**
 * A calendar day as the date input hands it over. Rejecting an impossible day
 * rather than letting `new Date` roll it forward keeps "2026-02-31" from
 * quietly filtering on the 3rd of March.
 */
const calendarDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Invalid date");

/**
 * The list filters. Every date is optional and each pair is read inclusively
 * in Manila; an open end means "no bound on that side" rather than today, so
 * a dispatch date with only a start still answers with everything since.
 *
 * `deliveredFrom`/`deliveredTo` filter the delivery date the list shows,
 * which is not a single column -- see `listTransfers`.
 */
export const listTransfersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    transferId: z.string().trim().max(100).optional(),
    status: z
      .enum([
        "DRAFT",
        "FOR_DISPATCH",
        "IN_TRANSIT",
        "RECEIVED",
        "DISCREPANCY_REPORTED",
        "UNDER_REVIEW",
        "RESOLVED",
        "CANCELLED",
      ])
      .optional(),
    sourceId: z.string().trim().max(100).optional(),
    destinationId: z.string().trim().max(100).optional(),
    reference: z.string().trim().max(100).optional(),
    dispatchedFrom: calendarDay.optional(),
    dispatchedTo: calendarDay.optional(),
    deliveredFrom: calendarDay.optional(),
    deliveredTo: calendarDay.optional(),
  })
  .superRefine((value, context) => {
    for (const [from, to] of [
      ["dispatchedFrom", "dispatchedTo"],
      ["deliveredFrom", "deliveredTo"],
    ] as const) {
      // Both are plain YYYY-MM-DD, so a string compare is a date compare.
      if (value[from] && value[to] && value[from]! > value[to]!) {
        context.addIssue({
          code: "custom",
          path: [to],
          message: "End date must be on or after start date",
        });
      }
    }
  });

export type ListTransfersQuery = z.infer<typeof listTransfersQuerySchema>;

export const createTransferSchema = z.object({
  /** Where the stock leaves from. Omitted when the actor has one location. */
  sourceId: z.string().min(1).optional(),
  destinationId: z.string().min(1),
  lines: z.array(z.object({ productId: z.string().min(1), quantity: positiveInt })).min(1),
  replacementForTransferId: z.string().min(1).optional(),
});

export const updateDraftTransferSchema = createTransferSchema.extend({
  version: z.number().int().positive(),
});

export const updateDraftSchema = z.object({
  version: z.number().int().positive(),
  lines: z.array(z.object({ productId: z.string().min(1), quantity: positiveInt })).min(1),
});

export const versionSchema = z.object({ version: z.number().int().positive() });

export const cancelTransferSchema = versionSchema.extend({
  reason: z.string().trim().min(1).max(4_000),
});

export const discrepancySchema = versionSchema.extend({
  notes: z.string().trim().min(1).max(4_000),
  lines: z.array(z.object({
    lineId: z.string().min(1), actualQuantity: z.number().int().min(0),
    reason: z.string().trim().min(1).max(200), notes: z.string().trim().max(1_000).optional(),
  })).min(1),
});

export const investigationSchema = versionSchema.extend({
  findings: z.string().trim().min(1).max(4_000),
});

export const resolutionSchema = versionSchema.extend({
  notes: z.string().trim().min(1).max(4_000),
  lines: z.array(z.object({
    lineId: z.string().min(1), destinationQuantity: z.number().int().min(0),
    restoreToSrQuantity: z.number().int().min(0), lossQuantity: z.number().int().min(0),
  })).min(1),
});

export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type UpdateDraftTransferInput = z.infer<typeof updateDraftTransferSchema>;
export type CancelTransferInput = z.infer<typeof cancelTransferSchema>;
export type DiscrepancyInput = z.infer<typeof discrepancySchema>;
export type InvestigationInput = z.infer<typeof investigationSchema>;
export type ResolutionInput = z.infer<typeof resolutionSchema>;

export type TransferProductOptionDto = {
  id: string;
  itemCode: string;
  name: string;
  availableQuantity: number;
};
