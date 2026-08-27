import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/server/prisma";
import { loadShellAccess } from "@/lib/server/shell";
import { StockTransfersClient } from "./stock-transfers-client";

export default async function StockTransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ transferId?: string }>;
}) {
  const access = await loadShellAccess(await headers());
  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("stock-transfers:view")) redirect("/access-denied");
  const stockRoom = access.identity.role === "ADMIN" || access.identity.role === "STOCK_STAFF"
    ? await prisma.location.findFirst({ where: { code: "SR", type: "WAREHOUSE", isActive: true }, select: { id: true } })
    : null;
  const [branches, products] = await Promise.all([
    prisma.location.findMany({ where: { isActive: true, type: "BRANCH", code: { in: ["QC", "BL", "LU", "VC", "SP"] } }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    stockRoom ? prisma.product.findMany({ where: { status: "ACTIVE" }, select: { id: true, itemCode: true, name: true, inventoryBalances: { where: { locationId: stockRoom.id }, select: { onHand: true, reserved: true } } }, orderBy: { itemCode: "asc" }, take: 500 }).then((rows) => rows.map((product) => ({ id: product.id, itemCode: product.itemCode, name: product.name, availableQuantity: Math.max(0, (product.inventoryBalances[0]?.onHand ?? 0) - (product.inventoryBalances[0]?.reserved ?? 0)) }))) : Promise.resolve([]),
  ]);
  const { transferId } = await searchParams;
  return <StockTransfersClient role={access.identity.role} branches={branches} products={products} initialTransferId={transferId} />;
}
