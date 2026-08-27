import "server-only";

import { Prisma } from "@prisma/client";
import webPush from "web-push";
import { z } from "zod";

import type { AuthContext } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2_000),
  keys: z.object({
    p256dh: z.string().min(1).max(1_000),
    auth: z.string().min(1).max(1_000),
  }),
});

let pushConfigured = false;
let deliveryTimer: NodeJS.Timeout | null = null;

export function pushPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
}

function configurePush() {
  const publicKey = pushPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.invalid";

  if (!publicKey || !privateKey) return false;
  if (!pushConfigured) {
    webPush.setVapidDetails(subject, publicKey, privateKey);
    pushConfigured = true;
  }
  return true;
}

export async function savePushSubscription(actor: AuthContext, input: unknown, userAgent?: string | null) {
  const subscription = pushSubscriptionSchema.parse(input);

  return prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      userId: actor.userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent,
    },
    update: {
      userId: actor.userId,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent,
      isActive: true,
      failedAt: null,
    },
  });
}

export async function deletePushSubscription(actor: AuthContext, input: unknown) {
  const subscription = z.object({ endpoint: z.string().url().max(2_000) }).parse(input);
  await prisma.pushSubscription.updateMany({
    where: { userId: actor.userId, endpoint: subscription.endpoint },
    data: { isActive: false, failedAt: new Date() },
  });
}

export function schedulePushDelivery() {
  if (deliveryTimer || !configurePush()) return;
  deliveryTimer = setTimeout(() => {
    deliveryTimer = null;
    void deliverPendingPushNotifications().catch((error) => {
      console.warn("Browser push delivery failed", error);
    });
  }, 500);
}

export async function deliverPendingPushNotifications(limit = 50) {
  if (!configurePush()) return { attempted: 0, sent: 0, failed: 0 };

  const notifications = await prisma.notification.findMany({
    where: { pushAttempts: { none: {} } },
    orderBy: { cursor: "asc" },
    take: limit,
  });

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: Array.from(new Set(notifications.map((notification) => notification.userId))) }, isActive: true },
  });
  const subscriptionsByUser = new Map<string, typeof subscriptions>();
  for (const subscription of subscriptions) {
    const userSubscriptions = subscriptionsByUser.get(subscription.userId) ?? [];
    userSubscriptions.push(subscription);
    subscriptionsByUser.set(subscription.userId, userSubscriptions);
  }

  let attempted = 0;
  let sent = 0;
  let failed = 0;

  for (const notification of notifications) {
    for (const subscription of subscriptionsByUser.get(notification.userId) ?? []) {
      attempted += 1;
      const payload = JSON.stringify({
        id: notification.id,
        title: notification.title,
        description: notification.description,
        relatedType: notification.relatedType,
        relatedId: notification.relatedId,
        relatedReference: notification.relatedReference,
      });

      try {
        await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload);
        await createAttempt({ notificationId: notification.id, subscriptionId: subscription.id, status: "SENT" });
        sent += 1;
      } catch (error) {
        const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : null;
        const message = error instanceof Error ? error.message : "Push provider rejected delivery";
        await createAttempt({ notificationId: notification.id, subscriptionId: subscription.id, status: "FAILED", error: message.slice(0, 1_000) });
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.update({ where: { id: subscription.id }, data: { isActive: false, failedAt: new Date() } });
        }
        failed += 1;
      }
    }
  }

  return { attempted, sent, failed };
}

async function createAttempt(data: Prisma.PushDeliveryAttemptUncheckedCreateInput) {
  try {
    await prisma.pushDeliveryAttempt.create({ data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }
}
