import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

const TEST_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
const DEVELOPMENT_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:55436/chezcar_catalog_dev?schema=public";

export function assertOperationalResetEnvironment(environment) {
  if (environment.allowOperationalDataReset !== "true") {
    throw new Error(
      "ALLOW_OPERATIONAL_DATA_RESET=true is required for operational data reset",
    );
  }
  if (
    environment.databaseUrl !== TEST_DATABASE_URL &&
    environment.databaseUrl !== DEVELOPMENT_DATABASE_URL
  ) {
    throw new Error(
      "Refusing operational data reset outside the approved isolated development or test database",
    );
  }
}

async function assertConnectedDatabaseTarget(tx, databaseUrl) {
  const expectedDatabase = decodeURIComponent(
    new URL(databaseUrl).pathname.slice(1),
  );
  const [identity] = await tx.$queryRaw`
    SELECT current_database() AS "databaseName"
  `;
  if (identity?.databaseName !== expectedDatabase) {
    throw new Error(
      "Refusing operational data reset because the connected database identity differs",
    );
  }
}

export async function resetOperationalData(prisma, environment) {
  assertOperationalResetEnvironment(environment);
  return prisma.$transaction(
    async (tx) => {
      await assertConnectedDatabaseTarget(tx, environment.databaseUrl);

      const deleted = {};
      deleted.pushDeliveryAttempts = (await tx.pushDeliveryAttempt.deleteMany()).count;
      deleted.pushSubscriptions = (await tx.pushSubscription.deleteMany()).count;
      deleted.notifications = (await tx.notification.deleteMany()).count;
      deleted.offlineSaleSubmissions = (await tx.offlineSaleSubmission.deleteMany()).count;
      deleted.offlineSyncOperations = (await tx.offlineSyncOperation.deleteMany()).count;
      deleted.offlineDeviceActivations = (await tx.offlineDeviceActivation.deleteMany()).count;
      deleted.saleAccountingReviews = (await tx.saleAccountingReview.deleteMany()).count;
      deleted.saleLines = (await tx.saleLine.deleteMany()).count;
      deleted.manualReceipts = (await tx.manualReceipt.deleteMany()).count;
      deleted.sales = (await tx.sale.deleteMany()).count;
      deleted.customerOrderLines = (await tx.customerOrderLine.deleteMany()).count;
      deleted.customerOrders = (await tx.customerOrder.deleteMany()).count;
      deleted.customers = (await tx.customer.deleteMany()).count;
      deleted.inventoryMovements = (await tx.inventoryMovement.deleteMany()).count;
      deleted.transferResolutionLines = (await tx.stockTransferResolutionLine.deleteMany()).count;
      deleted.transferResolutions = (await tx.stockTransferResolution.deleteMany()).count;
      deleted.transferInvestigations = (await tx.stockTransferInvestigation.deleteMany()).count;
      deleted.transferDiscrepancyLines = (await tx.stockTransferDiscrepancyLine.deleteMany()).count;
      deleted.transferDiscrepancies = (await tx.stockTransferDiscrepancy.deleteMany()).count;
      deleted.transferLines = (await tx.stockTransferLine.deleteMany()).count;
      deleted.stockTransfers = (await tx.stockTransfer.deleteMany()).count;
      deleted.stockReceiptLines = (await tx.stockReceiptLine.deleteMany()).count;
      deleted.stockReceipts = (await tx.stockReceipt.deleteMany()).count;
      deleted.inventoryBalances = (await tx.inventoryBalance.deleteMany()).count;
      deleted.verifications = (await tx.verification.deleteMany()).count;

      const [users, products, locations, roles] = await Promise.all([
        tx.user.count(),
        tx.product.count(),
        tx.location.count(),
        tx.roleDefinition.count(),
      ]);
      return { deleted, preserved: { users, products, locations, roles } };
    },
    { timeout: 30_000 },
  );
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await resetOperationalData(prisma, {
      databaseUrl: process.env.DATABASE_URL,
      allowOperationalDataReset: process.env.ALLOW_OPERATIONAL_DATA_RESET,
    });
    console.log("Operational data reset complete.");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Operational data reset failed");
    process.exit(1);
  });
}
