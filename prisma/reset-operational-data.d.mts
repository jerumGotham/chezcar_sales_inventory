import type { PrismaClient } from "@prisma/client";

export type OperationalResetEnvironment = {
  databaseUrl: string | undefined;
  allowOperationalDataReset: string | undefined;
};

export function assertOperationalResetEnvironment(
  environment: OperationalResetEnvironment,
): void;

export function resetOperationalData(
  prisma: PrismaClient,
  environment: OperationalResetEnvironment,
): Promise<{
  deleted: Record<string, number>;
  preserved: { users: number; products: number; locations: number };
}>;
