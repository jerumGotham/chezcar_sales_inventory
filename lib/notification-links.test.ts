import { describe, expect, it } from "vitest";

import { notificationDestination } from "./notification-links";

describe("notification destinations", () => {
  it("links every persisted transaction-related notification type", () => {
    expect(
      notificationDestination({
        relatedType: "STOCK_TRANSFER",
        relatedId: "transfer 1",
      }),
    ).toBe("/stock-transfers?transferId=transfer%201");
    expect(
      notificationDestination({ relatedType: "SALE", relatedId: "sale-1" }),
    ).toBe("/accounting/receipt-verification?saleId=sale-1");
    expect(
      notificationDestination({
        relatedType: "INVENTORY_BALANCE",
        relatedId: "balance-1",
      }),
    ).toBe("/inventory?balanceId=balance-1");
  });

  it("does not invent links for informational notifications", () => {
    expect(notificationDestination({ relatedType: null, relatedId: null })).toBeNull();
  });
});
