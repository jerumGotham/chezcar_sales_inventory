import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import type {
  InventoryApiResponse,
  InventoryRow,
  InventoryStatus,
  ProductsApiResponse,
} from "@/lib/catalog";
import { AuthorizationError } from "@/lib/server/authorization";
import {
  evaluateAccess,
  type PersistedAccessContext,
  validatePersistedAssignment,
} from "@/lib/server/policy/access";
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

export type ResolvedLocationScope =
  | { kind: "all" }
  | { kind: "location"; locationId: string };

const BRANCH_CODES = ["QC", "BL", "LU", "VC", "SP"] as const;

export function parseInventoryListQuery(
  searchParams: URLSearchParams,
  context: PersistedAccessContext,
): InventoryListQuery {
  const input: Record<string, string | string[]> = {};
  const keys = [...new Set(searchParams.keys())].sort();

  for (const key of keys) {
    if (key === "location" && context.role !== "ADMIN") {
      input.location = "all";
      continue;
    }

    const values = searchParams.getAll(key);
    const distinctValues = [...new Set(values)];
    input[key] =
      distinctValues.length === 1 ? distinctValues[0] : distinctValues;
  }

  return inventoryListQuerySchema.parse(input);
}

export async function resolveLocationScope(
  context: PersistedAccessContext,
  requestedLocation: string,
): Promise<ResolvedLocationScope> {
  if (
    !validatePersistedAssignment(context) ||
    !evaluateAccess(context, "inventory:view")
  ) {
    throw new AuthorizationError("Invalid persisted inventory scope");
  }

  if (context.role === "BRANCH_STAFF" || context.role === "STOCK_STAFF") {
    return { kind: "location", locationId: context.locationId as string };
  }

  if (requestedLocation === "all") {
    return { kind: "all" };
  }

  const location = await prisma.location.findFirst({
    where: {
      isActive: true,
      OR: [
        { id: requestedLocation },
        { code: requestedLocation },
        { name: requestedLocation },
      ],
      AND: {
        OR: [
          { code: "SR", type: "WAREHOUSE" },
          { code: { in: [...BRANCH_CODES] }, type: "BRANCH" },
        ],
      },
    },
    select: { id: true },
  });

  if (!location) {
    throw new AuthorizationError("Invalid inventory location scope");
  }

  return { kind: "location", locationId: location.id };
}

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
  context: PersistedAccessContext,
): Promise<InventoryApiResponse> {
  const scope = await resolveLocationScope(context, query.location);
  const scopeLocationId =
    scope.kind === "location" ? scope.locationId : undefined;
  const balanceWhere: Prisma.InventoryBalanceWhereInput = {
    locationId: scopeLocationId,
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
  const [total, summaryBalances, incomingItems] = await Promise.all([
    prisma.product.count({ where: productWhere }),
    prisma.inventoryBalance.findMany({
      where: { locationId: scopeLocationId },
      select: { productId: true, onHand: true, reorderLevel: true },
    }),
    prisma.stockTransferLine.aggregate({
      where: {
        transfer: {
          status: "IN_TRANSIT",
          destinationId:
            context.role === "BRANCH_STAFF"
              ? (context.locationId as string)
              : scopeLocationId,
        },
      },
      _sum: { inTransitQuantity: true },
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
  const totalUnits = summaryBalances.reduce(
    (sum, balance) => sum + balance.onHand,
    0,
  );
  const needsRestock = summaryBalances.filter(
    (balance) => stockStatus(balance.onHand, balance.reorderLevel) !== "In Stock",
  ).length;

  return {
    data: rows,
    meta,
    summary: {
      totalProducts: new Set(summaryBalances.map((balance) => balance.productId))
        .size,
      totalUnits,
      needsRestock,
      incomingItems: incomingItems._sum.inTransitQuantity ?? 0,
      incomingItemsLabel:
        context.role === "STOCK_STAFF"
          ? "Items in transit to branches"
          : "Incoming items",
    },
  };
}
