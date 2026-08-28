import { describe, expect, it } from "vitest";

import { canManageCustomerOrders, getCustomerOrderActions } from "./customer-order-actions";

describe("customer order actions", () => {
  it("limits mutations to Admin and Branch Staff", () => {
    expect(canManageCustomerOrders("ADMIN")).toBe(true);
    expect(canManageCustomerOrders("BRANCH_STAFF")).toBe(true);
    expect(canManageCustomerOrders("ACCOUNTING_STAFF")).toBe(false);
    expect(canManageCustomerOrders("STOCK_STAFF")).toBe(false);
  });

  it("offers reserve only for waiting-stock orders", () => {
    expect(getCustomerOrderActions({ role: "BRANCH_STAFF", statusCode: "WAITING_STOCK", downpayment: 0, balance: 100 }).canReserve).toBe(true);
    expect(getCustomerOrderActions({ role: "BRANCH_STAFF", statusCode: "RESERVED", downpayment: 0, balance: 100 }).canReserve).toBe(false);
  });

  it("offers release only for reserved states", () => {
    expect(getCustomerOrderActions({ role: "ADMIN", statusCode: "RESERVED", downpayment: 0, balance: 100 }).canRelease).toBe(true);
    expect(getCustomerOrderActions({ role: "ADMIN", statusCode: "READY_FOR_RELEASE", downpayment: 0, balance: 100 }).canRelease).toBe(true);
    expect(getCustomerOrderActions({ role: "ADMIN", statusCode: "WAITING_STOCK", downpayment: 0, balance: 100 }).canRelease).toBe(false);
  });

  it("limits downpayment cancellation to Admin and closes terminal orders", () => {
    expect(getCustomerOrderActions({ role: "BRANCH_STAFF", statusCode: "RESERVED", downpayment: 10, balance: 90 }).canCancel).toBe(false);
    expect(getCustomerOrderActions({ role: "ADMIN", statusCode: "RESERVED", downpayment: 10, balance: 90 }).canCancel).toBe(true);
    expect(getCustomerOrderActions({ role: "ADMIN", statusCode: "COMPLETED", downpayment: 0, balance: 0 })).toEqual({ canReserve: false, canRelease: false, canCancel: false, canRecordPayment: false });
  });
});
