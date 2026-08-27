import "server-only";

import type { NotificationType, Prisma } from "@prisma/client";

import type { AuthContext } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { schedulePushDelivery } from "./push-notifications";

export const NOTIFICATION_CHANNEL = "chezcar_notifications";

export class NotificationError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); }
}

type NotificationRecord = {
  id: string;
  cursor: bigint;
  title: string;
  description: string;
  type: NotificationType;
  relatedType: string | null;
  relatedId: string | null;
  relatedReference: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export async function listNotifications(actor: AuthContext) {
  const notifications = await prisma.notification.findMany({
    where: { userId: actor.userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return notifications.map(serializeNotification);
}

export async function listNotificationsAfter(actor: AuthContext, cursor: bigint) {
  const notifications = await prisma.notification.findMany({
    where: { userId: actor.userId, cursor: { gt: cursor } },
    orderBy: { cursor: "asc" },
    take: 100,
  });

  return notifications.map(serializeNotification);
}

export async function markNotificationRead(actor: AuthContext, id: string) {
  const result = await prisma.notification.updateMany({
    where: { id, userId: actor.userId, readAt: null },
    data: { readAt: new Date() },
  });

  if (result.count === 0) {
    const notification = await prisma.notification.findFirst({ where: { id, userId: actor.userId } });
    if (!notification) throw new NotificationError("NOT_FOUND", "Notification not found", 404);
    return serializeNotification(notification);
  }

  const notification = await prisma.notification.findFirstOrThrow({ where: { id, userId: actor.userId } });
  return serializeNotification(notification);
}

export async function markAllNotificationsRead(actor: AuthContext) {
  await prisma.notification.updateMany({
    where: { userId: actor.userId, readAt: null },
    data: { readAt: new Date() },
  });

  return listNotifications(actor);
}

export async function createNotifications(
  tx: Prisma.TransactionClient,
  notifications: Array<{
    userId: string;
    title: string;
    description: string;
    type: NotificationType;
    relatedType?: "STOCK_TRANSFER" | "INVENTORY_BALANCE" | "SALE";
    relatedId?: string;
    relatedReference?: string;
  }>,
) {
  if (notifications.length === 0) return;

  await tx.notification.createMany({ data: notifications });
  await tx.$executeRaw`SELECT pg_notify(${NOTIFICATION_CHANNEL}, '')`;
  schedulePushDelivery();
}

function inventoryAlertStatus(available: number, reorderLevel: number) {
  if (available <= 0) return "Out of Stock" as const;
  if (available <= reorderLevel) return "Low Stock" as const;
  return null;
}

export async function notifyInventoryThresholdChange(
  tx: Prisma.TransactionClient,
  input: {
    balanceId: string;
    locationId: string;
    locationName: string;
    productItemCode: string;
    productName: string;
    reorderLevel: number;
    previousAvailable: number;
    nextAvailable: number;
  },
) {
  const previousStatus = inventoryAlertStatus(input.previousAvailable, input.reorderLevel);
  const nextStatus = inventoryAlertStatus(input.nextAvailable, input.reorderLevel);
  if (!nextStatus || nextStatus === previousStatus) return;

  const recipients = await tx.user.findMany({
    where: { status: "ACTIVE", OR: [{ role: "ADMIN" }, { locationId: input.locationId }] },
    select: { id: true },
  });
  await createNotifications(tx, recipients.map((recipient) => ({
    userId: recipient.id,
    title: `${nextStatus}: ${input.productItemCode}`,
    description: `${input.productName} at ${input.locationName} now has ${input.nextAvailable} available piece(s).`,
    type: "WARNING",
    relatedType: "INVENTORY_BALANCE",
    relatedId: input.balanceId,
    relatedReference: input.productItemCode,
  })));
}

function formatRelativeTime(date: Date) {
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function serializeNotification(notification: NotificationRecord) {
  return {
    id: notification.id,
    cursor: notification.cursor.toString(),
    title: notification.title,
    description: notification.description,
    time: formatRelativeTime(notification.createdAt),
    type: notification.type.toLowerCase() as "info" | "warning" | "success",
    relatedType: notification.relatedType,
    relatedId: notification.relatedId,
    relatedReference: notification.relatedReference,
    read: Boolean(notification.readAt),
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}
