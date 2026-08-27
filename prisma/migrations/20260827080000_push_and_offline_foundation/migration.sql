CREATE TYPE "PushDeliveryStatus" AS ENUM ('SENT', 'FAILED');
CREATE TYPE "OfflineDeviceStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "OfflineSyncStatus" AS ENUM ('PENDING', 'ACCEPTED', 'ALREADY_ACCEPTED', 'REJECTED', 'NEEDS_REVIEW', 'CONFLICT');

CREATE TABLE "PushSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PushDeliveryAttempt" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "status" "PushDeliveryStatus" NOT NULL,
  "error" TEXT,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfflineDeviceActivation" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "activatedById" TEXT NOT NULL,
  "label" TEXT,
  "status" "OfflineDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastAuthorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OfflineDeviceActivation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfflineSyncOperation" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "operationType" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" "OfflineSyncStatus" NOT NULL,
  "actorId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "saleId" TEXT,
  "resultJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "OfflineSyncOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfflineSaleSubmission" (
  "id" TEXT NOT NULL,
  "syncOperationId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "submittedById" TEXT NOT NULL,
  "payloadJson" TEXT NOT NULL,
  "status" "OfflineSyncStatus" NOT NULL,
  "statusReason" TEXT,
  "saleId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfflineSaleSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_isActive_idx" ON "PushSubscription"("userId", "isActive");
CREATE UNIQUE INDEX "PushDeliveryAttempt_notificationId_subscriptionId_key" ON "PushDeliveryAttempt"("notificationId", "subscriptionId");
CREATE INDEX "PushDeliveryAttempt_subscriptionId_attemptedAt_idx" ON "PushDeliveryAttempt"("subscriptionId", "attemptedAt");
CREATE UNIQUE INDEX "OfflineDeviceActivation_deviceId_key" ON "OfflineDeviceActivation"("deviceId");
CREATE INDEX "OfflineDeviceActivation_locationId_status_idx" ON "OfflineDeviceActivation"("locationId", "status");
CREATE UNIQUE INDEX "OfflineSyncOperation_deviceId_idempotencyKey_key" ON "OfflineSyncOperation"("deviceId", "idempotencyKey");
CREATE INDEX "OfflineSyncOperation_locationId_status_idx" ON "OfflineSyncOperation"("locationId", "status");
CREATE UNIQUE INDEX "OfflineSaleSubmission_syncOperationId_key" ON "OfflineSaleSubmission"("syncOperationId");
CREATE INDEX "OfflineSaleSubmission_locationId_status_idx" ON "OfflineSaleSubmission"("locationId", "status");
CREATE INDEX "OfflineSaleSubmission_submittedById_createdAt_idx" ON "OfflineSaleSubmission"("submittedById", "createdAt");

ALTER TABLE "PushDeliveryAttempt" ADD CONSTRAINT "PushDeliveryAttempt_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PushDeliveryAttempt" ADD CONSTRAINT "PushDeliveryAttempt_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
