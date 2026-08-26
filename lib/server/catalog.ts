import "server-only";

import { Prisma, type InventoryMovementType } from "@prisma/client";
import { z } from "zod";

import type {
  InventoryApiResponse,
  InventoryMovementRow,
  InventoryMovementsApiResponse,
  InventoryRow,
  InventoryStatus,
  ProductsApiResponse,
} from "@/lib/catalog";
import { AuthorizationError, type AuthContext } from "@/lib/server/authorization";
import {
  evaluateAccess,
  type PersistedAccessContext,
  validatePersistedAssignment,
} from "@/lib/server/policy/access";
import { prisma } from "@/lib/server/prisma";
import { createNotifications } from "./services/notifications";

const baseListQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  itemCode: z.string().trim().max(100).default(""),
  name: z.string().trim().max(200).default(""),
  category: z.string().trim().max(100).default("all"),
};

export const productListQuerySchema = z.object({
  ...baseListQuery,
  brand: z.string().trim().max(100).default("all"),
  status: z.enum(["all", "Active", "Inactive"]).default("all"),
  stockStatus: z.enum(["all", "has-stock", "no-stock", "inactive-with-stock"]).default("all"),
});

const optionalText = z.string().trim().max(200).optional();
const positivePrice = z.coerce.number().positive();

export const productMutationSchema = z.object({
  itemCode: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  category: optionalText,
  brand: optionalText,
  description: z.string().trim().max(2_000).optional(),
  price: z.union([positivePrice, z.null()]),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export const inventoryListQuerySchema = z.object({
  ...baseListQuery,
  location: z.string().trim().max(150).default("all"),
  status: z
    .enum(["all", "In Stock", "Low Stock", "Out of Stock"])
    .default("all"),
});

export const inventoryCorrectionSchema = z.object({
  type: z.enum(["increase", "decrease"]),
  quantity: z.coerce.number().int().positive(),
  reference: z.string().trim().max(100).optional(),
  reason: z.string().trim().min(1).max(500),
  remarks: z.string().trim().max(1_000).optional(),
});

export const reorderLevelSchema = z.object({
  reorderLevel: z.coerce.number().int().min(0),
});

export const inventoryMovementsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  product: z.string().trim().max(100).default("all"),
  location: z.string().trim().max(150).default("all"),
  type: z.string().trim().max(100).default("all"),
  reference: z.string().trim().max(100).default(""),
});

type ProductListQuery = z.infer<typeof productListQuerySchema>;
type InventoryListQuery = z.infer<typeof inventoryListQuerySchema>;
type InventoryMovementsQuery = z.infer<typeof inventoryMovementsQuerySchema>;

export type ResolvedLocationScope =
  | { kind: "all" }
  | { kind: "location"; locationId: string };

export class ProductMutationError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); }
}

export class InventoryMutationError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); }
}

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

export function parseInventoryMovementsQuery(
  searchParams: URLSearchParams,
  context: PersistedAccessContext,
): InventoryMovementsQuery {
  const input: Record<string, string | string[]> = {};
  const keys = [...new Set(searchParams.keys())].sort();

  for (const key of keys) {
    if (key === "location" && context.role !== "ADMIN") {
      input.location = "all";
      continue;
    }

    const values = searchParams.getAll(key);
    const distinctValues = [...new Set(values)];
    input[key] = distinctValues.length === 1 ? distinctValues[0] : distinctValues;
  }

  return inventoryMovementsQuerySchema.parse(input);
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
    brand: query.brand === "all" ? undefined : query.brand,
    status:
      query.status === "all"
        ? undefined
        : query.status === "Active"
          ? "ACTIVE"
          : "INACTIVE",
  };

  if (query.stockStatus === "has-stock") {
    where.inventoryBalances = { some: { onHand: { gt: 0 } } };
  } else if (query.stockStatus === "no-stock") {
    where.inventoryBalances = { none: { onHand: { gt: 0 } } };
  } else if (query.stockStatus === "inactive-with-stock") {
    where.status = "INACTIVE";
    where.inventoryBalances = { some: { OR: [{ onHand: { gt: 0 } }, { reserved: { gt: 0 } }] } };
  }

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
      inventoryBalances: { select: { onHand: true, reserved: true, reorderLevel: true } },
      transferLines: { select: { id: true }, take: 1 },
      receiptLines: { select: { id: true }, take: 1 },
      inventoryMovements: { select: { id: true }, take: 1 },
    },
  });

  return {
    data: products.map((product) => ({
      id: product.id,
      itemCode: product.itemCode,
      name: product.name,
      category: product.category ?? "Uncategorized",
      brand: product.brand ?? "Unbranded",
      price: product.price?.toNumber() ?? null,
      reorderLevel: Math.max(
        0,
        ...product.inventoryBalances.map((balance) => balance.reorderLevel),
      ),
      status: product.status === "ACTIVE" ? "Active" : "Inactive",
      description: product.description ?? undefined,
      canEditItemCode: product.inventoryBalances.length === 0 && product.transferLines.length === 0 && product.receiptLines.length === 0 && product.inventoryMovements.length === 0,
      canDelete: product.inventoryBalances.length === 0 && product.transferLines.length === 0 && product.receiptLines.length === 0 && product.inventoryMovements.length === 0,
      hasStock: product.inventoryBalances.some((balance) => balance.onHand > 0 || balance.reserved > 0),
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

function assertAdmin(actor: AuthContext) {
  if (actor.role !== "ADMIN") {
    throw new ProductMutationError("FORBIDDEN", "Admin access required", 403);
  }
}

function assertInventoryAdmin(actor: AuthContext) {
  if (actor.role !== "ADMIN") {
    throw new InventoryMutationError("FORBIDDEN", "Admin access required", 403);
  }
}

function normalizeProductInput(input: z.infer<typeof productMutationSchema>) {
  if (input.status === "ACTIVE" && (input.price === null || input.price <= 0)) {
    throw new ProductMutationError("INVALID_PRICE", "Active products require a price greater than zero");
  }

  return {
    itemCode: input.itemCode,
    name: input.name,
    category: input.category || null,
    brand: input.brand || null,
    description: input.description || null,
    price: input.price === null ? null : new Prisma.Decimal(input.price),
    status: input.status,
  };
}

async function productUsage(productId: string) {
  const [balances, transferLines, receiptLines, movements] = await Promise.all([
    prisma.inventoryBalance.count({ where: { productId } }),
    prisma.stockTransferLine.count({ where: { productId } }),
    prisma.stockReceiptLine.count({ where: { productId } }),
    prisma.inventoryMovement.count({ where: { productId } }),
  ]);

  return balances + transferLines + receiptLines + movements;
}

export async function createProduct(actor: AuthContext, input: z.infer<typeof productMutationSchema>) {
  assertAdmin(actor);
  const data = normalizeProductInput(input);

  try {
    return await prisma.product.create({
      data: { ...data, createdById: actor.userId, updatedById: actor.userId },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ProductMutationError("DUPLICATE_ITEM_CODE", "Item code already exists", 409);
    }
    throw error;
  }
}

export async function updateProduct(actor: AuthContext, productId: string, input: z.infer<typeof productMutationSchema>) {
  assertAdmin(actor);
  const existing = await prisma.product.findUnique({ where: { id: productId } });
  if (!existing) throw new ProductMutationError("NOT_FOUND", "Product not found", 404);
  const data = normalizeProductInput(input);
  const usageCount = await productUsage(productId);

  if (existing.itemCode !== data.itemCode && usageCount > 0) {
    throw new ProductMutationError("ITEM_CODE_LOCKED", "Item code cannot be changed after product usage exists", 409);
  }

  try {
    return await prisma.product.update({
      where: { id: productId },
      data: {
        ...data,
        updatedById: actor.userId,
        deactivatedById: existing.status === "ACTIVE" && data.status === "INACTIVE" ? actor.userId : existing.deactivatedById,
        reactivatedById: existing.status === "INACTIVE" && data.status === "ACTIVE" ? actor.userId : existing.reactivatedById,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ProductMutationError("DUPLICATE_ITEM_CODE", "Item code already exists", 409);
    }
    throw error;
  }
}

export async function deleteProduct(actor: AuthContext, productId: string) {
  assertAdmin(actor);
  const usageCount = await productUsage(productId);
  if (usageCount > 0) {
    throw new ProductMutationError("PRODUCT_USED", "Products with balances or history cannot be deleted", 409);
  }

  try {
    await prisma.product.delete({ where: { id: productId } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new ProductMutationError("NOT_FOUND", "Product not found", 404);
    }
    throw error;
  }

  return { id: productId };
}

function stockStatus(onHand: number, reserved: number, reorderLevel: number): InventoryStatus {
  const available = onHand - reserved;
  if (available <= 0) return "Out of Stock";
  if (available <= reorderLevel) return "Low Stock";
  return "In Stock";
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
  const [matchingProducts, summaryBalances, incomingItems] = await Promise.all([
    prisma.product.findMany({
      where: productWhere,
      orderBy: { itemCode: "asc" },
      include: {
        inventoryBalances: {
          where: balanceWhere,
          orderBy: { location: { name: "asc" } },
          include: { location: { select: { name: true } } },
        },
      },
    }),
    prisma.inventoryBalance.findMany({
      where: { locationId: scopeLocationId },
      select: { productId: true, onHand: true, reserved: true, reorderLevel: true },
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
  const productsWithMatchingStatus = query.status === "all"
    ? matchingProducts
    : matchingProducts
        .map((product) => ({
          ...product,
          inventoryBalances: product.inventoryBalances.filter(
            (balance) => stockStatus(balance.onHand, balance.reserved, balance.reorderLevel) === query.status,
          ),
        }))
        .filter((product) => product.inventoryBalances.length > 0);
  const { meta, skip } = pagination(query.page, query.pageSize, productsWithMatchingStatus.length);
  const products = productsWithMatchingStatus.slice(skip, skip + query.pageSize);
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
      status: stockStatus(balance.onHand, balance.reserved, balance.reorderLevel),
    })),
  );
  const totalUnits = summaryBalances.reduce(
    (sum, balance) => sum + balance.onHand,
    0,
  );
  const needsRestock = summaryBalances.filter(
    (balance) => stockStatus(balance.onHand, balance.reserved, balance.reorderLevel) !== "In Stock",
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

export async function listInventoryMovements(
  query: InventoryMovementsQuery,
  context: PersistedAccessContext,
): Promise<InventoryMovementsApiResponse> {
  const scope = await resolveLocationScope(context, query.location);
  const where: Prisma.InventoryMovementWhereInput = {
    locationId: scope.kind === "location" ? scope.locationId : undefined,
    product: query.product === "all" ? undefined : { itemCode: query.product },
    type: query.type === "all" ? undefined : movementTypeFromLabel(query.type),
    reference: query.reference ? { contains: query.reference, mode: "insensitive" } : undefined,
  };

  const total = await prisma.inventoryMovement.count({ where });
  const { meta, skip } = pagination(query.page, query.pageSize, total);
  const movements = await prisma.inventoryMovement.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip,
      take: query.pageSize,
      include: {
        product: { select: { itemCode: true, name: true } },
        location: { select: { name: true } },
        transfer: { select: { reference: true } },
        receipt: { select: { reference: true } },
      },
    });

  return {
    data: movements.map(serializeInventoryMovement),
    meta,
  };
}

function movementTypeFromLabel(label: string) {
  const entries: Record<string, InventoryMovementType> = {
    "Receive": "SUPPLIER_RECEIPT",
    "Receive Stocks": "SUPPLIER_RECEIPT",
    "Adjustment +": "MANUAL_ADJUSTMENT",
    "Adjustment -": "MANUAL_ADJUSTMENT",
    "Manual Adjustment": "MANUAL_ADJUSTMENT",
    "Transfer In": "TRANSFER_RECEIPT",
    "Transfer Out": "TRANSFER_DISPATCH",
    "Transfer Restoration": "TRANSFER_RESTORATION",
    "Transfer Loss": "TRANSFER_LOSS",
    "Transfer Resolution": "TRANSFER_RESOLUTION",
  };

  return entries[label];
}

function movementTypeLabel(movement: { type: string; quantity: number }) {
  if (movement.type === "SUPPLIER_RECEIPT") return "Receive";
  if (movement.type === "MANUAL_ADJUSTMENT") return movement.quantity >= 0 ? "Adjustment +" : "Adjustment -";
  if (movement.type === "TRANSFER_DISPATCH") return "Transfer Out";
  if (movement.type === "TRANSFER_RECEIPT") return "Transfer In";
  if (movement.type === "TRANSFER_RESTORATION") return "Transfer Restoration";
  if (movement.type === "TRANSFER_LOSS") return "Transfer Loss";
  if (movement.type === "TRANSFER_RESOLUTION") return "Transfer Resolution";
  return movement.type;
}

function serializeInventoryMovement(movement: {
  id: string;
  occurredAt: Date;
  type: string;
  quantity: number;
  reference: string | null;
  remarks: string | null;
  location: { name: string } | null;
  product: { itemCode: string; name: string };
  transfer: { reference: string } | null;
  receipt: { reference: string } | null;
}): InventoryMovementRow {
  return {
    id: movement.id,
    date: movement.occurredAt.toISOString(),
    type: movementTypeLabel(movement),
    qty: movement.quantity,
    reference: movement.reference ?? movement.transfer?.reference ?? movement.receipt?.reference ?? "-",
    remarks: movement.remarks ?? "",
    location: movement.location?.name ?? "Transit / loss",
    itemCode: movement.product.itemCode,
    itemName: movement.product.name,
  };
}

export async function correctInventoryBalance(
  actor: AuthContext,
  balanceId: string,
  input: z.infer<typeof inventoryCorrectionSchema>,
) {
  assertInventoryAdmin(actor);
  const delta = input.type === "increase" ? input.quantity : -input.quantity;

  return prisma.$transaction(async (tx) => {
    const balance = await tx.inventoryBalance.findUnique({
      where: { id: balanceId },
      include: {
        product: { select: { itemCode: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });

    if (!balance) {
      throw new InventoryMutationError("NOT_FOUND", "Inventory balance not found", 404);
    }

    const previousStatus = stockStatus(balance.onHand, balance.reserved, balance.reorderLevel);
    const nextOnHand = balance.onHand + delta;
    if (nextOnHand < balance.reserved) {
      throw new InventoryMutationError("BELOW_RESERVED", "Adjustment cannot reduce on-hand stock below reserved quantity", 409);
    }

    const updated = await tx.inventoryBalance.update({
      where: { id: balance.id },
      data: { onHand: nextOnHand, version: { increment: 1 } },
      include: {
        product: { select: { itemCode: true, name: true, category: true } },
        location: { select: { name: true } },
      },
    });

    await tx.inventoryMovement.create({
      data: {
        productId: balance.productId,
        locationId: balance.locationId,
        quantity: delta,
        type: "MANUAL_ADJUSTMENT",
        actorId: actor.userId,
        reference: input.reference || null,
        remarks: [input.reason, input.remarks].filter(Boolean).join(" - "),
      },
    });

    const nextStatus = stockStatus(updated.onHand, updated.reserved, updated.reorderLevel);
    if (nextStatus !== previousStatus && nextStatus !== "In Stock") {
      const users = await tx.user.findMany({
        where: {
          status: "ACTIVE",
          OR: [{ role: "ADMIN" }, { locationId: balance.locationId }],
        },
        select: { id: true },
      });

      await createNotifications(tx, users.map((user) => ({
        userId: user.id,
        title: `${nextStatus}: ${balance.product.itemCode}`,
        description: `${balance.product.name} at ${balance.location.name} now has ${updated.onHand - updated.reserved} available piece(s).`,
        type: nextStatus === "Out of Stock" ? "WARNING" : "INFO",
        relatedType: "INVENTORY_BALANCE",
        relatedId: balance.id,
        relatedReference: balance.product.itemCode,
      })));
    }

    return serializeInventoryBalance(updated, nextStatus);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateInventoryReorderLevel(
  actor: AuthContext,
  balanceId: string,
  input: z.infer<typeof reorderLevelSchema>,
) {
  assertInventoryAdmin(actor);

  try {
    const updated = await prisma.inventoryBalance.update({
      where: { id: balanceId },
      data: { reorderLevel: input.reorderLevel, version: { increment: 1 } },
      include: {
        product: { select: { itemCode: true, name: true, category: true } },
        location: { select: { name: true } },
      },
    });

    return serializeInventoryBalance(
      updated,
      stockStatus(updated.onHand, updated.reserved, updated.reorderLevel),
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new InventoryMutationError("NOT_FOUND", "Inventory balance not found", 404);
    }
    throw error;
  }
}

function serializeInventoryBalance(
  balance: {
    id: string;
    onHand: number;
    reserved: number;
    reorderLevel: number;
    unitCost: Prisma.Decimal;
    updatedAt: Date;
    product: { itemCode: string; name: string; category: string | null };
    location: { name: string };
  },
  status: InventoryStatus,
): InventoryRow {
  return {
    id: balance.id,
    itemCode: balance.product.itemCode,
    name: balance.product.name,
    category: balance.product.category ?? "Uncategorized",
    location: balance.location.name,
    onHand: balance.onHand,
    reserved: balance.reserved,
    reorderLevel: balance.reorderLevel,
    unitCost: balance.unitCost.toNumber(),
    lastUpdated: balance.updatedAt.toISOString(),
    status,
  };
}
