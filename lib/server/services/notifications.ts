import "server-only";

import type { NotificationType, Prisma } from "@prisma/client";

import type { AuthContext } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";

export class NotificationError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); }
}

type NotificationRecord = {
  id: string;
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
