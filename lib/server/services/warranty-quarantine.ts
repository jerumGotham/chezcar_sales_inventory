import type { CustomerWarrantyResolution, CustomerWarrantyStatus } from "@prisma/client";

type WarrantyQuarantineState = {
  receivedQuantity: number;
  returnedQuantity: number;
  resolution: CustomerWarrantyResolution | null;
  status: CustomerWarrantyStatus;
};

export function calculateWarrantyQuarantine(
  warranty: WarrantyQuarantineState,
  allocatedQuantity: number,
  openAllocatedQuantity: number,
) {
  const repairReleased = warranty.resolution === "REPAIR" && ["RELEASED", "COMPLETED"].includes(warranty.status);
  const physicalQuantity = repairReleased ? 0 : Math.max(0, warranty.receivedQuantity - warranty.returnedQuantity);
  const unassignedQuantity = Math.max(0, physicalQuantity - allocatedQuantity);
  return {
    unassignedQuantity,
    unresolvedQuantity: Math.min(physicalQuantity, unassignedQuantity + openAllocatedQuantity),
  };
}
