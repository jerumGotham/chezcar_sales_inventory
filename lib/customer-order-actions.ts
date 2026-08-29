import type { CapabilityId } from "./contracts/roles";
import { hasCapability } from "./permissions";

export type CustomerOrderStatusCode =
  | "RESERVED"
  | "WAITING_STOCK"
  | "READY_FOR_RELEASE"
  | "COMPLETED"
  | "CANCELLED";

type CustomerOrderActionInput = {
  capabilities: readonly CapabilityId[];
  statusCode: CustomerOrderStatusCode;
  downpayment: number;
  balance: number;
};

export function getCustomerOrderActions({ capabilities, statusCode, downpayment, balance }: CustomerOrderActionInput) {
  const isOpen = statusCode !== "COMPLETED" && statusCode !== "CANCELLED";
  const canCancel = hasCapability(capabilities, "customer-orders:cancel");

  return {
    canReserve: hasCapability(capabilities, "customer-orders:reserve") && statusCode === "WAITING_STOCK",
    canRelease: hasCapability(capabilities, "customer-orders:release") && (statusCode === "RESERVED" || statusCode === "READY_FOR_RELEASE"),
    canCancel: canCancel && (downpayment <= 0 || hasCapability(capabilities, "customer-orders:cancel-paid")) && isOpen,
    canRecordPayment: hasCapability(capabilities, "customer-orders:record-payment") && isOpen && balance > 0,
  };
}
