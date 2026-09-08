import type { CapabilityId } from "@/lib/contracts/roles";

const IMPLIED_CAPABILITIES: Partial<Record<CapabilityId, readonly CapabilityId[]>> = {
  "notifications:mark-read": ["notifications:view"],
  "notifications:push": ["notifications:view"],
  "customers:create": ["customers:view"],
  "customers:update": ["customers:view"],
  "customers:deactivate": ["customers:view"],
  "customer-orders:create": ["customer-orders:view"],
  "customer-orders:reserve": ["customer-orders:view"],
  "customer-orders:record-payment": ["customer-orders:view"],
  "customer-orders:release": ["customer-orders:view"],
  "customer-orders:cancel": ["customer-orders:view"],
  "customer-orders:cancel-paid": ["customer-orders:view"],
  "sales:post": ["sales:view"],
  "sales:correction:request": ["sales:view"],
  "sales:verify": ["sales:verify:view"],
  "sales:resolve": ["sales:verify:view"],
  "sales:void-replace": ["sales:verify:view"],
  "sales:mismatch:respond": ["sales:verify:view"],
  "sales:evidence:view": ["sales:verify:view"],
  "sales:evidence:upload": ["sales:evidence:view", "sales:verify:view"],
  "sales:evidence:delete": ["sales:evidence:view", "sales:verify:view"],
  "products:create": ["products:view"],
  "products:update": ["products:view"],
  "products:delete": ["products:view"],
  "products:image:update": ["products:view"],
  "inventory-availability:view": ["inventory:view"],
  "inventory-movements:view": ["inventory:view"],
  "inventory:adjust": ["inventory:view", "inventory-movements:view"],
  "inventory:cost:update": ["inventory:view", "inventory-movements:view"],
  "stock-receipts:view": ["inventory:view"],
  "inventory-receiving:create": ["inventory:view", "inventory-movements:view", "stock-receipts:view"],
  "stock-transfers:create": ["stock-transfers:view"],
  "stock-transfers:update": ["stock-transfers:view"],
  "stock-transfers:delete": ["stock-transfers:view"],
  "stock-transfers:finalize": ["stock-transfers:view"],
  "stock-transfers:dispatch": ["stock-transfers:view"],
  "stock-transfers:cancel": ["stock-transfers:view"],
  "stock-transfers:receive": ["stock-transfers:view"],
  "stock-transfers:report-discrepancy": ["stock-transfers:view"],
  "stock-transfers:investigate": ["stock-transfers:view"],
  "stock-transfers:resolve": ["stock-transfers:view"],
  "stock-transfers:audit:view": ["stock-transfers:view"],
  "reports:export": ["reports:view"],
  "offline-sales:sync": ["offline-sales:snapshot", "sales:view"],
  "users:create": ["users:view"],
  "users:update": ["users:view"],
  "users:set-status": ["users:view"],
  "users:reset-password": ["users:view"],
  "branches:create": ["branches:view"],
  "branches:update": ["branches:view"],
  "suppliers:create": ["suppliers:view"],
  "suppliers:update": ["suppliers:view"],
  "suppliers:deactivate": ["suppliers:view"],
  "personnel:create": ["personnel:view"],
  "personnel:update": ["personnel:view"],
  "personnel:deactivate": ["personnel:view"],
  "backjobs:create": ["backjobs:view"],
  "backjobs:update": ["backjobs:view"],
  "backjobs:delete": ["backjobs:view"],
  "backjobs:schedule": ["backjobs:view"],
  "backjobs:complete": ["backjobs:view"],
  "backjobs:parts:issue": ["backjobs:view", "inventory:view", "inventory-movements:view"],
  "backjobs:parts:return": ["backjobs:view", "inventory:view", "inventory-movements:view"],
  "backjobs:print": ["backjobs:view"],
  "customer-warranties:create": ["customer-warranties:view"],
  "customer-warranties:photos:add": ["customer-warranties:view"],
  "customer-warranties:receive-quarantine": ["customer-warranties:view", "inventory:view", "inventory-movements:view"],
  "customer-warranties:assess": ["customer-warranties:view"],
  "customer-warranties:approve": ["customer-warranties:view"],
  "customer-warranties:release": ["customer-warranties:view", "inventory:view", "inventory-movements:view"],
  "customer-warranties:complete": ["customer-warranties:view"],
  "customer-warranties:print": ["customer-warranties:view"],
  "supplier-claims:create": ["supplier-claims:view"],
  "supplier-claims:manage": ["supplier-claims:view"],
  "supplier-claims:return-stock": ["supplier-claims:view", "inventory:view", "inventory-movements:view"],
  "supplier-claims:receive-replacement": ["supplier-claims:view", "inventory:view", "inventory-movements:view"],
  "supplier-claims:repair-stock": ["supplier-claims:view", "inventory:view", "inventory-movements:view"],
  "supplier-claims:record-monetary-resolution": ["supplier-claims:view"],
  "supplier-claims:approve-writeoff": ["supplier-claims:view", "inventory:view", "inventory-movements:view"],
  "supplier-claims:close": ["supplier-claims:view"],
  "supplier-claims:evidence": ["supplier-claims:view"],
  "supplier-claims:print": ["supplier-claims:view"],
  "roles:create": ["roles:view"],
  "roles:update": ["roles:view"],
};

export function hasCapability(
  granted: readonly CapabilityId[],
  required: CapabilityId,
): boolean {
  if (granted.includes(required)) return true;

  return granted.some((capability) =>
    IMPLIED_CAPABILITIES[capability]?.includes(required),
  );
}

export function effectiveCapabilities(
  granted: readonly CapabilityId[],
): readonly CapabilityId[] {
  const effective = new Set(granted);
  let changed = true;

  while (changed) {
    changed = false;
    for (const capability of effective) {
      for (const implied of IMPLIED_CAPABILITIES[capability] ?? []) {
        if (!effective.has(implied)) {
          effective.add(implied);
          changed = true;
        }
      }
    }
  }

  return [...effective];
}
