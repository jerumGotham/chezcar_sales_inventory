import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/contracts/stock-receipts", async () => import("../../../lib/contracts/stock-receipts"));

import { parseReceiptFormData } from "./form-data";

function receiptForm(lines: Array<{ productId: string; quantity: string; unitCost: string }>) {
  const formData = new FormData();
  formData.set("reference", "DR-1001");
  formData.set("supplier", "Acme Supplier");
  formData.set("lineCount", String(lines.length));
  lines.forEach((line, index) => {
    formData.set(`productId-${index}`, line.productId);
    formData.set(`quantity-${index}`, line.quantity);
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

    expect(result).toEqual({ ok: false, message: "Every quantity must be greater than 0." });
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
