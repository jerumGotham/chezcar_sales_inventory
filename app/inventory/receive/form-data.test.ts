import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/contracts/stock-receipts", async () => import("../../../lib/contracts/stock-receipts"));

import { parseReceiptFormData } from "./form-data";

function receiptForm(lines: Array<{ productId: string; quantity: string; unitCost: string; quarantined?: string; missing?: string; reason?: string }>) {
  const formData = new FormData();
  formData.set("reference", "DR-1001");
  formData.set("supplierId", "supplier-1");
  formData.set("lineCount", String(lines.length));
  lines.forEach((line, index) => {
    formData.set(`productId-${index}`, line.productId);
    formData.set(`expectedQuantity-${index}`, line.quantity);
    formData.set(`acceptedQuantity-${index}`, String(Number(line.quantity) - Number(line.quarantined ?? 0) - Number(line.missing ?? 0)));
    formData.set(`quarantinedQuantity-${index}`, line.quarantined ?? "0");
    formData.set(`missingQuantity-${index}`, line.missing ?? "0");
    formData.set(`claimReason-${index}`, line.reason ?? "");
    formData.set(`unitCost-${index}`, line.unitCost);
  });
  return formData;
}

describe("supplier receipt form parsing", () => {
  it("rejects the entire form when any line is invalid", () => {
    const result = parseReceiptFormData(receiptForm([
      { productId: "product-1", quantity: "2", unitCost: "10" },
      { productId: "product-2", quantity: "0", unitCost: "5" },
    ]));

    expect(result).toEqual({ ok: false, message: "Every expected quantity must be greater than 0." });
  });

  it("parses split quantities and claim metadata", () => {
    const result = parseReceiptFormData(receiptForm([{ productId: "product-1", quantity: "5", quarantined: "2", missing: "1", reason: "DAMAGE", unitCost: "10" }]));
    expect(result).toMatchObject({ ok: true, input: { lines: [{ expectedQuantity: 5, acceptedQuantity: 2, quarantinedQuantity: 2, missingQuantity: 1, claimReason: "DAMAGE" }] } });
  });

  it("rejects the entire form when a product is duplicated", () => {
    const result = parseReceiptFormData(receiptForm([
      { productId: "product-1", quantity: "2", unitCost: "10" },
      { productId: "product-1", quantity: "1", unitCost: "5" },
    ]));

    expect(result).toEqual({ ok: false, message: "Each product can only appear once." });
  });

  it("rejects extra indexed lines hidden by a lower line count", () => {
    const formData = receiptForm([
      { productId: "product-1", quantity: "2", unitCost: "10" },
      { productId: "product-2", quantity: "1", unitCost: "5" },
    ]);
    formData.set("lineCount", "1");

    expect(parseReceiptFormData(formData)).toEqual({
      ok: false,
      message: "Receipt line count does not match the submitted lines.",
    });
  });
});
