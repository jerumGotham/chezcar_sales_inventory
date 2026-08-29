import "server-only";

import type { Prisma } from "@prisma/client";
import { z } from "zod";

import type {
  InventoryAvailabilityResponse,
  InventoryAvailabilityStatus,
} from "@/lib/inventory-availability";
import {
  AuthorizationError,
  type AuthContext,
} from "@/lib/server/authorization";
import {
  findActiveOperationalLocation,
  listActiveOperationalLocations,
} from "@/lib/server/locations";
import {
  canAccessLocation,
  evaluateAccess,
  hasAllLocationAccess,
  validatePersistedAssignment,
} from "@/lib/server/policy/access";
import { prisma } from "@/lib/server/prisma";

export const inventoryAvailabilityQuerySchema = z.object({
  search: z.string().trim().max(200).default(""),
  product: z.string().trim().max(100).default("all"),
  category: z.string().trim().max(100).default("all"),
  location: z.string().trim().max(150).default("all"),
  status: z
    .enum(["all", "In Stock", "Low Stock", "Out of Stock"])
    .default("all"),
});

type InventoryAvailabilityQuery = z.infer<
  typeof inventoryAvailabilityQuerySchema
>;

export function parseInventoryAvailabilityQuery(
  searchParams: URLSearchParams,
): InventoryAvailabilityQuery {
  const input: Record<string, string | string[]> = {};

  for (const key of [...new Set(searchParams.keys())].sort()) {
    const values = searchParams.getAll(key);
    const distinctValues = [...new Set(values)];
    input[key] =
      distinctValues.length === 1 ? distinctValues[0] : distinctValues;
  }

  return inventoryAvailabilityQuerySchema.parse(input);
}

async function resolveAvailabilityLocation(
  context: AuthContext,
  requestedLocation: string,
) {
  if (
    !validatePersistedAssignment(context) ||
    !evaluateAccess(context, "inventory:view")
  ) {
    throw new AuthorizationError("Invalid persisted inventory scope");
  }

  if (requestedLocation === "all") return undefined;

  const location = await findActiveOperationalLocation(requestedLocation);

  if (!location || !canAccessLocation(context, location.id)) {
    throw new AuthorizationError("Invalid inventory location scope");
  }

  return location.id;
}

function availabilityStatus(
  available: number,
  reorderLevel: number,
): InventoryAvailabilityStatus {
  if (available <= 0) return "Out of Stock";
  if (available <= reorderLevel) return "Low Stock";
  return "In Stock";
}

export async function listInventoryAvailability(
  query: InventoryAvailabilityQuery,
  context: AuthContext,
): Promise<InventoryAvailabilityResponse> {
  const locationId = await resolveAvailabilityLocation(context, query.location);
  const scopeWhere: Prisma.InventoryBalanceWhereInput = {
    locationId: locationId
      ? locationId
      : hasAllLocationAccess(context)
        ? undefined
        : { in: [...context.locationIds] },
    location: {
      isActive: true,
      OR: [{ type: "BRANCH" }, { code: "SR", type: "WAREHOUSE" }],
    },
  };
  const productWhere: Prisma.ProductWhereInput = {
    category: query.category === "all" ? undefined : query.category,
    OR: query.search
      ? [
          { itemCode: { contains: query.search, mode: "insensitive" } },
          { name: { contains: query.search, mode: "insensitive" } },
        ]
      : undefined,
  };

  if (query.product !== "all") {
    productWhere.AND = {
      OR: [{ id: query.product }, { itemCode: query.product }],
    };
  }

  const [balances, optionBalances, locations] = await Promise.all([
    prisma.inventoryBalance.findMany({
      where: { ...scopeWhere, product: productWhere },
      orderBy: [
        { product: { itemCode: "asc" } },
        { location: { name: "asc" } },
      ],
      include: {
        product: {
          select: {
            id: true,
            itemCode: true,
            name: true,
            category: true,
            reorderLevel: true,
          },
        },
        location: { select: { id: true, code: true, name: true, type: true } },
      },
    }),
    prisma.inventoryBalance.findMany({
      where: scopeWhere,
      select: {
        product: {
          select: { id: true, itemCode: true, name: true, category: true },
        },
      },
    }),
    listActiveOperationalLocations(),
  ]);

  const products = new Map<
    string,
    { id: string; itemCode: string; name: string }
  >();
  const categories = new Set<string>();

  optionBalances.forEach(({ product }) => {
    products.set(product.id, {
      id: product.id,
      itemCode: product.itemCode,
      name: product.name,
    });
    if (product.category) categories.add(product.category);
  });

  return {
    data: balances
      .map((balance) => {
        const available = balance.onHand - balance.reserved;
        return {
          product: {
            id: balance.product.id,
            itemCode: balance.product.itemCode,
            name: balance.product.name,
            category: balance.product.category ?? "Uncategorized",
          },
          location: balance.location,
          onHand: balance.onHand,
          reserved: balance.reserved,
          available,
          status: availabilityStatus(available, balance.product.reorderLevel),
        };
      })
      .filter((row) => query.status === "all" || row.status === query.status),
    filterOptions: {
      products: [...products.values()].sort((left, right) =>
        left.itemCode.localeCompare(right.itemCode),
      ),
      categories: [...categories].sort(),
      locations: locations
        .filter((location) =>
          locationId
            ? location.id === locationId
            : hasAllLocationAccess(context) || context.locationIds.includes(location.id),
        )
        .map((location) => ({
          id: location.id,
          code: location.code,
          name: location.name,
          type: location.type,
        })),
    },
  };
}
