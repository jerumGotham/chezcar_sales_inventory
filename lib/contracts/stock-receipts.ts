import { z } from "zod";

export const createStockReceiptSchema = z.object({
  reference: z.string().trim().min(1, "Enter a receipt reference.").max(100),
  supplierId: z.string().trim().min(1, "Select a supplier."),
  notes: z.string().trim().max(4_000).optional(),
  lines: z.array(z.object({
    productId: z.string().trim().min(1, "Select a product for every line."),
    expectedQuantity: z.number().int().positive("Every expected quantity must be greater than 0."),
    acceptedQuantity: z.number().int().min(0),
    quarantinedQuantity: z.number().int().min(0),
    missingQuantity: z.number().int().min(0),
    claimReason: z.enum(["DAMAGE", "DEFECT", "INCOMPLETE", "WRONG_ITEM"]).optional(),
    claimNotes: z.string().trim().max(1_000).optional(),
    unitCost: z.number().positive("Every unit cost must be greater than 0."),
  }).superRefine((line, context) => {
    if (line.expectedQuantity !== line.acceptedQuantity + line.quarantinedQuantity + line.missingQuantity) {
      context.addIssue({ code: "custom", path: ["expectedQuantity"], message: "Expected must equal accepted + quarantined + missing." });
    }
    if ((line.quarantinedQuantity > 0 || line.missingQuantity > 0) && !line.claimReason) {
      context.addIssue({ code: "custom", path: ["claimReason"], message: "Select a supplier claim reason for affected stock." });
    }
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
