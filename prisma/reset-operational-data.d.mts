import type { PrismaClient } from "@prisma/client";

export type OperationalResetEnvironment = {
  nodeEnv: string | undefined;
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
  preserved: { users: number; products: number; locations: number; roles: number };
}>;
