import { Prisma, type PaymentMethod } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../prisma", () => ({ prisma: {} }));
vi.mock("./notifications", () => ({ createNotifications: vi.fn() }));

import { accountingResolutionSchema, accountingReviewSchema, compareReceipt } from "./customer-sales";

const sale = {
  manualReceiptNumber: "0001",
  receiptBooklet: "BK-01",
  paymentMethod: "CASH" as PaymentMethod,
  discountAmount: new Prisma.Decimal(10),
  amountPaid: new Prisma.Decimal(90),
  totalAmount: new Prisma.Decimal(90),
  lines: [{ productItemCode: "ITEM-1", quantity: 2, unitPrice: new Prisma.Decimal(50) }],
};

const matchingComparison = {
  receiptBooklet: "BK-01",
  receiptNumber: "0001",
  paymentMethod: "CASH" as const,
  discountAmount: 10,
  amountPaid: 90,
  totalAmount: 90,
  lines: [{ itemCode: "ITEM-1", quantity: 2, unitPrice: 50 }],
};

describe("receipt comparison contracts", () => {
  it("accepts an exact paper receipt comparison", () => {
    expect(compareReceipt(sale, matchingComparison)).toEqual([]);
    expect(accountingReviewSchema.parse({ status: "VERIFIED", comparison: matchingComparison })).toMatchObject({ status: "VERIFIED" });
  });

  it("reports structured differences", () => {
    expect(compareReceipt(sale, { ...matchingComparison, totalAmount: 100, lines: [{ itemCode: "ITEM-1", quantity: 1, unitPrice: 50 }] })).toEqual(expect.arrayContaining(["Total amount does not match", "Quantity does not match: ITEM-1"]));
  });

  it("requires mismatch notes and replacement details", () => {
    expect(() => accountingReviewSchema.parse({ status: "MISMATCH_REPORTED", comparison: matchingComparison })).toThrow();
    expect(() => accountingResolutionSchema.parse({ action: "VOIDED_REPLACED", note: "Correction needed" })).toThrow();
  });
});
