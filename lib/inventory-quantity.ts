export type InventoryQuantities = {
  onHand: number;
  reserved: number;
  quarantined: number;
};

export function availableStock(balance: InventoryQuantities) {
  return balance.onHand - balance.reserved - balance.quarantined;
}
