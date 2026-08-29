import { describe, expect, it } from "vitest";

import type { CapabilityId } from "./contracts/roles";
import { getCustomerOrderActions } from "./customer-order-actions";

function actions(
  capabilities: readonly CapabilityId[],
  overrides: Partial<{
    statusCode: "RESERVED" | "WAITING_STOCK" | "READY_FOR_RELEASE" | "COMPLETED" | "CANCELLED";
    downpayment: number;
    balance: number;
  }> = {},
) {
  return getCustomerOrderActions({
    capabilities,
    statusCode: "RESERVED",
    downpayment: 0,
    balance: 100,
    ...overrides,
  });
}

describe("customer order actions", () => {
  it("offers no mutations without explicit action grants", () => {
    expect(actions([])).toEqual({
      canReserve: false,
      canRelease: false,
      canCancel: false,
      canRecordPayment: false,
    });
  });

  it("offers reserve only with its grant for waiting-stock orders", () => {
    expect(actions(["customer-orders:reserve"], { statusCode: "WAITING_STOCK" }).canReserve).toBe(true);
    expect(actions(["customer-orders:reserve"]).canReserve).toBe(false);
    expect(actions(["customer-orders:release"], { statusCode: "WAITING_STOCK" }).canReserve).toBe(false);
  });

  it("offers release only with its grant for reserved states", () => {
    expect(actions(["customer-orders:release"]).canRelease).toBe(true);
    expect(actions(["customer-orders:release"], { statusCode: "READY_FOR_RELEASE" }).canRelease).toBe(true);
    expect(actions(["customer-orders:release"], { statusCode: "WAITING_STOCK" }).canRelease).toBe(false);
    expect(actions(["customer-orders:reserve"]).canRelease).toBe(false);
  });

  it("requires cancel for unpaid orders and both cancellation grants for paid orders", () => {
    expect(actions(["customer-orders:cancel"]).canCancel).toBe(true);
    expect(actions(["customer-orders:cancel", "customer-orders:cancel-paid"], { downpayment: 10 }).canCancel).toBe(true);
    expect(actions(["customer-orders:cancel-paid"], { downpayment: 10 }).canCancel).toBe(false);
    expect(actions(["customer-orders:cancel"], { downpayment: 10 }).canCancel).toBe(false);
    expect(actions(["customer-orders:cancel-paid"]).canCancel).toBe(false);
  });

  it("does not offer cancellation or payment for terminal orders", () => {
    expect(actions(["customer-orders:cancel", "customer-orders:record-payment"], {
      statusCode: "COMPLETED",
      balance: 0,
    })).toEqual({
      canReserve: false,
      canRelease: false,
      canCancel: false,
      canRecordPayment: false,
    });
  });

  it("offers payment only with its grant while an open balance remains", () => {
    expect(actions(["customer-orders:record-payment"]).canRecordPayment).toBe(true);
    expect(actions(["customer-orders:record-payment"], { balance: 0 }).canRecordPayment).toBe(false);
    expect(actions(["customer-orders:create"]).canRecordPayment).toBe(false);
  });
});
