import "server-only";

import { Prisma, type UserRole } from "@prisma/client";
import { z } from "zod";

import type {
  InventoryApiResponse,
  InventoryRow,
  InventoryStatus,
  ProductsApiResponse,
} from "@/lib/catalog";
import { prisma } from "@/lib/server/prisma";

const baseListQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  itemCode: z.string().trim().max(100).default(""),
  name: z.string().trim().max(200).default(""),
  category: z.string().trim().max(100).default("all"),
};

export const productListQuerySchema = z.object({
  ...baseListQuery,
  status: z.enum(["all", "Active", "Inactive"]).default("all"),
});

export const inventoryListQuerySchema = z.object({
  ...baseListQuery,
  location: z.string().trim().max(150).default("all"),
  status: z
    .enum(["all", "In Stock", "Low Stock", "Out of Stock"])
    .default("all"),
});

type ProductListQuery = z.infer<typeof productListQuerySchema>;
type InventoryListQuery = z.infer<typeof inventoryListQuerySchema>;

function pagination(page: number, pageSize: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  return {
    meta: { page: safePage, pageSize, total, totalPages },
    skip: (safePage - 1) * pageSize,
  };
}

export async function listProducts(
  query: ProductListQuery,
): Promise<ProductsApiResponse> {
  const where: Prisma.ProductWhereInput = {
    itemCode: query.itemCode
      ? { contains: query.itemCode, mode: "insensitive" }
      : undefined,
    name: query.name
      ? { contains: query.name, mode: "insensitive" }
      : undefined,
    category: query.category === "all" ? undefined : query.category,
    status:
      query.status === "all"
        ? undefined
        : query.status === "Active"
          ? "ACTIVE"
          : "INACTIVE",
  };

  const [total, totalProducts, activeProducts, inactiveProducts, withReorderLevel] =
    await Promise.all([
      prisma.product.count({ where }),
      prisma.product.count(),
      prisma.product.count({ where: { status: "ACTIVE" } }),
      prisma.product.count({ where: { status: "INACTIVE" } }),
      prisma.product.count({
        where: { inventoryBalances: { some: { reorderLevel: { gt: 0 } } } },
      }),
    ]);
  const { meta, skip } = pagination(query.page, query.pageSize, total);
  const products = await prisma.product.findMany({
    where,
    orderBy: { itemCode: "asc" },
    skip,
    take: query.pageSize,
    include: {
      inventoryBalances: { select: { reorderLevel: true } },
    },
  });

  return {
    data: products.map((product) => ({
      id: product.id,
      itemCode: product.itemCode,
      name: product.name,
      category: product.category ?? "Uncategorized",
      price: product.price?.toNumber() ?? null,
      reorderLevel: Math.max(
        0,
        ...product.inventoryBalances.map((balance) => balance.reorderLevel),
      ),
      status: product.status === "ACTIVE" ? "Active" : "Inactive",
      description: product.description ?? undefined,
    })),
    meta,
    summary: {
      totalProducts,
      activeProducts,
      inactiveProducts,
      withReorderLevel,
    },
  };
}

function stockStatus(onHand: number, reorderLevel: number): InventoryStatus {
  if (onHand <= 0) return "Out of Stock";
  if (onHand <= reorderLevel) return "Low Stock";
  return "In Stock";
}

function statusWhere(
  status: InventoryListQuery["status"],
): Prisma.InventoryBalanceWhereInput {
  if (status === "Out of Stock") {
    return { onHand: { lte: 0 } };
  }

  if (status === "Low Stock") {
    return {
      AND: [
        { onHand: { gt: 0 } },
        { onHand: { lte: prisma.inventoryBalance.fields.reorderLevel } },
      ],
    };
  }

  if (status === "In Stock") {
    return { onHand: { gt: prisma.inventoryBalance.fields.reorderLevel } };
  }

  return {};
}

export async function listInventory(
  query: InventoryListQuery,
  user: { role: UserRole; locationId: string | null },
): Promise<InventoryApiResponse> {
  const scopeLocationId =
    user.role === "BRANCH_STAFF" ? user.locationId ?? "__unassigned__" : null;
  const balanceWhere: Prisma.InventoryBalanceWhereInput = {
    locationId: scopeLocationId ?? undefined,
    location:
      scopeLocationId || query.location === "all"
        ? undefined
        : { name: query.location },
    ...statusWhere(query.status),
  };
  const productWhere: Prisma.ProductWhereInput = {
    itemCode: query.itemCode
      ? { contains: query.itemCode, mode: "insensitive" }
      : undefined,
    name: query.name
      ? { contains: query.name, mode: "insensitive" }
      : undefined,
    category: query.category === "all" ? undefined : query.category,
    inventoryBalances: { some: balanceWhere },
  };
  const [total, summaryBalances] = await Promise.all([
    prisma.product.count({ where: productWhere }),
    prisma.inventoryBalance.findMany({
      where: { locationId: scopeLocationId ?? undefined },
      select: { onHand: true, reorderLevel: true },
    }),
  ]);
  const { meta, skip } = pagination(query.page, query.pageSize, total);
  const products = await prisma.product.findMany({
    where: productWhere,
    orderBy: { itemCode: "asc" },
    skip,
    take: query.pageSize,
    include: {
      inventoryBalances: {
        where: balanceWhere,
        orderBy: { location: { name: "asc" } },
        include: { location: { select: { name: true } } },
      },
    },
  });
  const rows: InventoryRow[] = products.flatMap((product) =>
    product.inventoryBalances.map((balance) => ({
      id: balance.id,
      itemCode: product.itemCode,
      name: product.name,
      category: product.category ?? "Uncategorized",
      location: balance.location.name,
      onHand: balance.onHand,
      reserved: balance.reserved,
      reorderLevel: balance.reorderLevel,
      unitCost: balance.unitCost.toNumber(),
      lastUpdated: balance.updatedAt.toISOString(),
      status: stockStatus(balance.onHand, balance.reorderLevel),
    })),
  );
  const statuses = summaryBalances.map((balance) =>
    stockStatus(balance.onHand, balance.reorderLevel),
  );

  return {
    data: rows,
    meta,
    summary: {
      totalItems: summaryBalances.length,
      inStock: statuses.filter((status) => status === "In Stock").length,
      lowStock: statuses.filter((status) => status === "Low Stock").length,
      outOfStock: statuses.filter((status) => status === "Out of Stock").length,
    },
  };
}
