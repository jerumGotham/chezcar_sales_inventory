import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/server/prisma";
import { loadShellAccess } from "@/lib/server/shell";
import { requireCapability } from "@/lib/server/authorization";
import { listActiveSupplierOptionsForReceiving } from "@/lib/server/services/suppliers";
import { listRecentStockReceipts } from "@/lib/server/services/stock-receipts";
import { listAccessibleActiveBranches } from "@/lib/server/locations";

import { ReceiveStockForm } from "./receive-stock-form";

export default async function ReceiveStockPage() {
  const requestHeaders = await headers();
  const access = await loadShellAccess(requestHeaders);
  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("inventory-receiving:create")) redirect("/access-denied");

  const actor = await requireCapability(requestHeaders, "inventory-receiving:create");

  const [products, suppliers, locations, recentReceipts] = await Promise.all([
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ itemCode: "asc" }],
      select: { id: true, itemCode: true, name: true },
    }),
    listActiveSupplierOptionsForReceiving(actor),
    // Branches only, as Branch Maintenance defines them. A delivery is
    // received at the branch that physically took it.
    listAccessibleActiveBranches(actor),
    listRecentStockReceipts(actor),
  ]);

  return (
    <ReceiveStockForm
      products={products}
      suppliers={suppliers}
      locations={locations.map(({ id, code, name }) => ({ id, code, name }))}
      recentReceipts={recentReceipts.map((receipt) => ({
        id: receipt.id,
        reference: receipt.reference,
        supplierName: receipt.supplier.name,
        locationName: receipt.location.name,
        receivedAt: receipt.receivedAt,
        receiptPhotoUrls: receipt.receiptPhotoUrls,
      }))}
    />
  );
}
