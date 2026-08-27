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
  return null;
}
