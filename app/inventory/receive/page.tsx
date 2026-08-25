import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/server/prisma";
import { loadShellAccess } from "@/lib/server/shell";

import { ReceiveStockForm } from "./receive-stock-form";

export default async function ReceiveStockPage() {
  const access = await loadShellAccess(await headers());
  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("inventory-receiving:create")) redirect("/access-denied");

  const products = await prisma.product.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ itemCode: "asc" }],
    select: { id: true, itemCode: true, name: true },
  });

  return <ReceiveStockForm products={products} />;
}
