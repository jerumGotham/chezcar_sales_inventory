export type RelatedNotification = {
  relatedType?: string | null;
  relatedId?: string | null;
};

export function notificationDestination(
  notification: RelatedNotification,
): string | null {
  if (!notification.relatedId) return null;
  const id = encodeURIComponent(notification.relatedId);
  if (notification.relatedType === "STOCK_TRANSFER") {
    return `/stock-transfers?transferId=${id}`;
  }
  if (notification.relatedType === "SALE") {
    return `/accounting/receipt-verification?saleId=${id}`;
  }
  if (notification.relatedType === "INVENTORY_BALANCE") {
    return `/inventory?balanceId=${id}`;
  }
  if (notification.relatedType === "BACKJOB") {
    return `/inventory/returns-warranty?backjobId=${id}`;
  }
  if (notification.relatedType === "CUSTOMER_WARRANTY") return `/inventory/returns-warranty/warranties/${id}`;
  if (notification.relatedType === "SUPPLIER_CLAIM") return `/inventory/returns-warranty/supplier-claims/${id}`;
  return null;
}
