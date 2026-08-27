import { z } from "zod";

export const createStockReceiptSchema = z.object({
  reference: z.string().trim().min(1).max(100),
  supplier: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(4_000).optional(),
  lines: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().int().positive(),
    unitCost: z.number().positive(),
  })).min(1),
});

export type CreateStockReceiptInput = z.infer<typeof createStockReceiptSchema>;
