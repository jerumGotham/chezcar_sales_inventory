import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    notification: {
      findMany: vi.fn(),
    },
  },
}));

import { createNotifications, listNotificationsAfter, notifyInventoryThresholdChange } from "./notifications";
import { prisma } from "@/lib/server/prisma";

describe("notifications service", () => {
  it("wakes realtime listeners after durable notification inserts", async () => {
    const tx = {
      notification: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      $executeRaw: vi.fn().mockResolvedValue(1),
    };

    await createNotifications(tx as never, [
      {
        userId: "user-1",
        title: "Stock dispatched",
        description: "Transfer TR-1 is in transit",
        type: "INFO",
        relatedType: "STOCK_TRANSFER",
        relatedId: "transfer-1",
        relatedReference: "TR-1",
      },
    ]);

    expect(tx.notification.createMany).toHaveBeenCalledOnce();
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it("lists unread catch-up notifications after a cursor in ascending order", async () => {
    vi.mocked(prisma.notification.findMany).mockResolvedValueOnce([
      {
        id: "notification-2",
        cursor: BigInt(2),
        title: "Mismatch reported",
        description: "Sale SALE-1 needs review",
        type: "WARNING",
        relatedType: "SALE",
        relatedId: "sale-1",
        relatedReference: "SALE-1",
        readAt: null,
        createdAt: new Date("2026-08-27T00:00:00.000Z"),
      },
    ] as never);

    const rows = await listNotificationsAfter({
      userId: "user-1",
      role: "ADMIN",
      roleDefinitionId: "role-admin",
      roleScope: "OWNER",
      capabilities: [],
      isOwner: true,
      locationId: null,
      location: null,
    }, BigInt(1));

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", cursor: { gt: BigInt(1) } },
      orderBy: { cursor: "asc" },
      take: 100,
    });
    expect(rows).toEqual([
      expect.objectContaining({
        id: "notification-2",
        cursor: "2",
        type: "warning",
        read: false,
      }),
    ]);
  });

  it("notifies Admin and assigned branch users when available stock crosses the reorder threshold", async () => {
    const tx = {
      user: { findMany: vi.fn().mockResolvedValue([{ id: "admin-1" }, { id: "branch-1" }]) },
      notification: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
      $executeRaw: vi.fn().mockResolvedValue(1),
    };

    await notifyInventoryThresholdChange(tx as never, {
      balanceId: "balance-1",
      locationId: "location-qc",
      locationName: "QC Branch",
      productItemCode: "ITEM-1",
      productName: "Sample Item",
      reorderLevel: 3,
      previousAvailable: 4,
      nextAvailable: 3,
    });

    expect(tx.user.findMany).toHaveBeenCalledWith({
      where: { status: "ACTIVE", OR: [{ role: "ADMIN" }, { locationId: "location-qc" }] },
      select: { id: true },
    });
    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ userId: "admin-1", title: "Low Stock: ITEM-1", relatedId: "balance-1" }),
        expect.objectContaining({ userId: "branch-1", title: "Low Stock: ITEM-1", relatedId: "balance-1" }),
      ]),
    });
  });

  it("does not repeat a notification while stock remains in the same low-stock state", async () => {
    const tx = {
      user: { findMany: vi.fn() },
      notification: { createMany: vi.fn() },
      $executeRaw: vi.fn(),
    };

    await notifyInventoryThresholdChange(tx as never, {
      balanceId: "balance-1",
      locationId: "location-qc",
      locationName: "QC Branch",
      productItemCode: "ITEM-1",
      productName: "Sample Item",
      reorderLevel: 3,
      previousAvailable: 3,
      nextAvailable: 2,
    });

    expect(tx.user.findMany).not.toHaveBeenCalled();
    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });
});
