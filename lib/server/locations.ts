import "server-only";

import type { Location, Prisma, PrismaClient } from "@prisma/client";

import type { PersistedAccessContext } from "./policy/access";
import { accessibleLocationWhere } from "./policy/access";
import { prisma } from "./prisma";

type LocationDb = PrismaClient | Prisma.TransactionClient;

export type ActiveBranchOption = Pick<Location, "id" | "code" | "name">;
export type ActiveLocationRecord = Pick<
  Location,
  "id" | "code" | "name" | "type" | "isActive"
>;

export function isActiveBranch(
  location: Pick<Location, "type" | "isActive"> | null,
): boolean {
  return location?.type === "BRANCH" && location.isActive;
}

export async function listActiveBranches(
  db: LocationDb = prisma,
): Promise<ActiveBranchOption[]> {
  return db.location.findMany({
    where: { type: "BRANCH", isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: [{ code: "asc" }, { name: "asc" }],
  });
}

export async function listAccessibleActiveBranches(
  context: PersistedAccessContext,
  db: LocationDb = prisma,
): Promise<ActiveBranchOption[]> {
  return db.location.findMany({
    where: {
      type: "BRANCH",
      isActive: true,
      ...accessibleLocationWhere(context),
    },
    select: { id: true, code: true, name: true },
    orderBy: [{ code: "asc" }, { name: "asc" }],
  });
}

export async function findActiveBranch(
  locationId: string,
  db: LocationDb = prisma,
): Promise<ActiveBranchOption | null> {
  return db.location.findFirst({
    where: { id: locationId, type: "BRANCH", isActive: true },
    select: { id: true, code: true, name: true },
  });
}

export async function listActiveOperationalLocations(
  db: LocationDb = prisma,
): Promise<ActiveLocationRecord[]> {
  const locations = await db.location.findMany({
    where: {
      isActive: true,
      type: "BRANCH",
    },
    select: { id: true, code: true, name: true, type: true, isActive: true },
    orderBy: [{ code: "asc" }, { name: "asc" }],
  });

  return locations;
}

export async function listAccessibleOperationalLocations(
  context: PersistedAccessContext,
  db: LocationDb = prisma,
): Promise<ActiveLocationRecord[]> {
  const locations = await db.location.findMany({
    where: {
      isActive: true,
      type: "BRANCH",
      ...accessibleLocationWhere(context),
    },
    select: { id: true, code: true, name: true, type: true, isActive: true },
    orderBy: [{ code: "asc" }, { name: "asc" }],
  });

  return locations;
}

export async function findActiveOperationalLocation(
  value: string,
  db: LocationDb = prisma,
): Promise<Pick<Location, "id"> | null> {
  const exact = await db.location.findFirst({
    where: {
      isActive: true,
      OR: [{ id: value }, { code: value }],
      AND: { type: "BRANCH" },
    },
    select: { id: true },
  });
  if (exact) return exact;

  const nameMatches = await db.location.findMany({
    where: {
      isActive: true,
      name: value,
      type: "BRANCH",
    },
    select: { id: true },
    take: 2,
  });
  return nameMatches.length === 1 ? nameMatches[0] : null;
}
