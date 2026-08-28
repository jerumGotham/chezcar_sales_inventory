import { z } from "zod";

export const createStockReceiptSchema = z.object({
  reference: z.string().trim().min(1, "Enter a receipt reference.").max(100),
  supplier: z.string().trim().min(1, "Enter a supplier name.").max(200),
  notes: z.string().trim().max(4_000).optional(),
  lines: z.array(z.object({
    productId: z.string().trim().min(1, "Select a product for every line."),
    quantity: z.number().int("Every quantity must be a whole number.").positive("Every quantity must be greater than 0."),
    unitCost: z.number().positive("Every unit cost must be greater than 0."),
  })).min(1).max(50),
}).superRefine((input, context) => {
  const seen = new Set<string>();

  input.lines.forEach((line, index) => {
    if (seen.has(line.productId)) {
      context.addIssue({
        code: "custom",
        path: ["lines", index, "productId"],
        message: "Each product can only appear once.",
      });
    }
    seen.add(line.productId);
  });
});

export type CreateStockReceiptInput = z.infer<typeof createStockReceiptSchema>;
