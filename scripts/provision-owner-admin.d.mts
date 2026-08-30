import type { PrismaClient } from "@prisma/client";

export type OwnerProvisioningEnvironment = {
  NODE_ENV?: string;
  ALLOW_OWNER_PROVISIONING?: string;
  DATABASE_URL?: string;
  PROVISION_OWNER_DATABASE?: string;
  PROVISION_OWNER_EMAIL?: string;
  PROVISION_OWNER_PASSWORD?: string;
  PROVISION_OWNER_NAME?: string;
};

export function ownerProvisioningInput(environment: OwnerProvisioningEnvironment): {
  databaseUrl: string;
  expectedDatabase: string;
  email: string;
  password: string;
  name: string;
};

export function provisionOwnerAdmin(
  prisma: PrismaClient,
  environment: OwnerProvisioningEnvironment,
): Promise<{ id: string; email: string; name: string }>;
