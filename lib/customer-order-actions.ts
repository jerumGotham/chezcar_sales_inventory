import type { ShellRole } from "@/lib/contracts/access";

export type CustomerOrderStatusCode =
  | "RESERVED"
  | "WAITING_STOCK"
  | "READY_FOR_RELEASE"
  | "COMPLETED"
  | "CANCELLED";

type CustomerOrderActionInput = {
  role: ShellRole | null;
  statusCode: CustomerOrderStatusCode;
  downpayment: number;
  balance: number;
};

export function canManageCustomerOrders(role: ShellRole | null) {
  return role === "ADMIN" || role === "BRANCH_STAFF";
}

export function getCustomerOrderActions({ role, statusCode, downpayment, balance }: CustomerOrderActionInput) {
  const canManage = canManageCustomerOrders(role);
  const isOpen = statusCode !== "COMPLETED" && statusCode !== "CANCELLED";

  return {
    canReserve: canManage && statusCode === "WAITING_STOCK",
    canRelease: canManage && (statusCode === "RESERVED" || statusCode === "READY_FOR_RELEASE"),
    canCancel: canManage && isOpen && (downpayment <= 0 || role === "ADMIN"),
    canRecordPayment: canManage && isOpen && balance > 0,
  };
}
