import { z } from "zod";

const positiveInt = z.number().int().positive();

export const createTransferSchema = z.object({
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
