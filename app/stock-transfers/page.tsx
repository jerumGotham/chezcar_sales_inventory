import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/server/prisma";
import { loadShellAccess } from "@/lib/server/shell";
import { StockTransfersClient } from "./stock-transfers-client";

export default async function StockTransfersPage() {
  const access = await loadShellAccess(await headers());
  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("stock-transfers:view")) redirect("/access-denied");
  const [branches, products] = await Promise.all([
    prisma.location.findMany({ where: { isActive: true, type: "BRANCH", code: { in: ["QC", "BL", "LU", "VC", "SP"] } }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    access.identity.role === "STOCK_STAFF" ? prisma.product.findMany({ where: { status: "ACTIVE" }, select: { id: true, itemCode: true, name: true }, orderBy: { itemCode: "asc" }, take: 500 }) : [],
  ]);
  return <StockTransfersClient role={access.identity.role} branches={branches} products={products} />;
}
