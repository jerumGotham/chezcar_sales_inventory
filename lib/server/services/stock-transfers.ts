import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type StockTransferStatus } from "@prisma/client";

import {
  assertCapability,
  type AuthContext,
} from "@/lib/server/authorization";
import type {
  CreateTransferInput,
  DiscrepancyInput,
  InvestigationInput,
  ResolutionInput,
} from "@/lib/contracts/stock-transfers";
import { prisma } from "@/lib/server/prisma";
import { findActiveBranch } from "@/lib/server/locations";
import { canAccessLocation, hasAllLocationAccess } from "@/lib/server/policy/access";
import { createNotifications } from "./notifications";

export class TransferError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
  ) {
    super(message);
  }
}

const TRANSFER_INCLUDE = {
  destination: { select: { id: true, code: true, name: true } },
  lines: {
    include: { product: { select: { id: true, itemCode: true, name: true } } },
  },
  discrepancy: {
    include: {
      lines: true,
      reportedBy: { select: { name: true } },
    },
  },
  investigation: {
    include: { submittedBy: { select: { name: true } } },
  },
  resolution: {
    include: { lines: true, postedBy: { select: { name: true } } },
  },
  createdBy: { select: { name: true } },
  finalizedBy: { select: { name: true } },
  dispatchedBy: { select: { name: true } },
  receivedBy: { select: { name: true } },
  movements: {
    include: {
      actor: { select: { name: true } },
      location: { select: { code: true, name: true } },
      product: { select: { itemCode: true, name: true } },
    },
    orderBy: { occurredAt: "asc" },
  },
} satisfies Prisma.StockTransferInclude;

type TransferRecord = Prisma.StockTransferGetPayload<{
  include: typeof TRANSFER_INCLUDE;
}>;

async function assertSourceActor(actor: AuthContext) {
  const stockRoom = await prisma.location.findFirst({
    where: { code: "SR", type: "WAREHOUSE", isActive: true },
    select: { id: true },
  });
  if (!stockRoom || !canAccessLocation(actor, stockRoom.id)) {
    throw new TransferError(
      "FORBIDDEN",
      "Owner or Stock Room scope is required",
      403,
    );
  }
}

export function canAccessTransferRecord(
  actor: AuthContext,
  sourceId: string,
  destinationId: string,
) {
  // Transfer access is deliberately source-or-destination scoped. Source
  // access authorizes the SR workflow record, not destination business data.
  return canAccessLocation(actor, sourceId) || canAccessLocation(actor, destinationId);
}
function canViewTransferAudit(actor: AuthContext) {
  return actor.isOwner;
}
function assertVersion(actual: number, expected: number) {
  if (actual !== expected)
    throw new TransferError(
      "STALE_VERSION",
      "Transfer changed; reload before retrying",
    );
}

async function lockTransfer(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "StockTransfer" WHERE id = ${id} FOR UPDATE`;
  const transfer = await tx.stockTransfer.findUnique({
    where: { id },
    include: TRANSFER_INCLUDE,
  });
  if (!transfer)
    throw new TransferError("NOT_FOUND", "Transfer not found", 404);
  return transfer;
}

function ensureBranchScope(actor: AuthContext, destinationId: string) {
  if (!canAccessLocation(actor, destinationId))
    throw new TransferError(
      "FORBIDDEN",
      "Transfer is outside your branch",
      403,
    );
}

async function decreaseAvailableBalance(
  tx: Prisma.TransactionClient,
  locationId: string,
  productId: string,
  quantity: number,
) {
  const balance = await tx.inventoryBalance.findUnique({
    where: { locationId_productId: { locationId, productId } },
    select: { onHand: true, reserved: true, version: true },
  });
  if (!balance || balance.onHand - balance.reserved < quantity) {
    throw new TransferError(
      "INSUFFICIENT_STOCK",
      "Insufficient available source stock",
    );
  }
  const result = await tx.inventoryBalance.updateMany({
    where: {
      locationId,
      productId,
      version: balance.version,
      onHand: { gte: balance.reserved + quantity },
    },
    data: { onHand: { decrement: quantity }, version: { increment: 1 } },
  });
  if (result.count !== 1) {
    throw new TransferError(
      "STALE_BALANCE",
      "Source stock changed; reload before retrying",
    );
  }
}

async function increaseBalance(
  tx: Prisma.TransactionClient,
  locationId: string,
  productId: string,
  quantity: number,
) {
  await tx.inventoryBalance.upsert({
    where: { locationId_productId: { locationId, productId } },
    create: { locationId, productId, onHand: quantity },
    update: { onHand: { increment: quantity }, version: { increment: 1 } },
  });
}

async function activeUsersForCapability(
  tx: Prisma.TransactionClient,
  capability: string,
  locationId?: string,
) {
  return tx.user.findMany({
    where: {
      status: "ACTIVE",
      accessRole: { OR: [{ isOwner: true }, { permissions: { has: capability } }] },
      ...(locationId
        ? {
            OR: [
              { accessRole: { isOwner: true } },
              { accessRole: { permissions: { has: "locations:all" } } },
              { locationAssignments: { some: { locationId } } },
            ],
          }
        : {}),
    },
    select: { id: true },
  });
}

async function stockRoomId(tx: Prisma.TransactionClient) {
  const stockRoom = await tx.location.findFirstOrThrow({
    where: { code: "SR", type: "WAREHOUSE", isActive: true },
    select: { id: true },
  });

  return stockRoom.id;
}

async function notifyUsersForTransfer(
  tx: Prisma.TransactionClient,
  transfer: {
    id: string;
    reference: string;
    destinationId: string;
    destination: { name: string };
  },
  recipients: Array<{
    capability: string;
    locationId?: string;
  }>,
  notification: {
    title: string;
    description: string;
    type: "INFO" | "WARNING" | "SUCCESS";
  },
) {
  const users = await Promise.all(
    recipients.map((recipient) =>
      activeUsersForCapability(tx, recipient.capability, recipient.locationId),
    ),
  );
  const recipientIds = [...new Set(users.flat().map((user) => user.id))];

  await createNotifications(
    tx,
    recipientIds.map((userId) => ({
      userId,
      title: notification.title,
      description: notification.description,
      type: notification.type,
      relatedType: "STOCK_TRANSFER",
      relatedId: transfer.id,
      relatedReference: transfer.reference,
    })),
  );
}

export async function listTransfers(
  actor: AuthContext,
  query: { page: number; pageSize: number; transferId?: string } = {
    page: 1,
    pageSize: 10,
  },
) {
  assertCapability(actor, "stock-transfers:view");
  const stockRoom = await prisma.location.findFirst({ where: { code: "SR", isActive: true }, select: { id: true } });
  const canAccessSource = Boolean(stockRoom && canAccessLocation(actor, stockRoom.id));
  const where: Prisma.StockTransferWhereInput = {
    id: query.transferId,
    destinationId: canAccessSource || hasAllLocationAccess(actor)
      ? undefined
      : { in: [...actor.locationIds] },
  };
  const [total, transfers] = await prisma.$transaction([
    prisma.stockTransfer.count({ where }),
    prisma.stockTransfer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: TRANSFER_INCLUDE,
    }),
  ]);
  return {
    data: transfers.map((transfer) =>
      serializeTransfer(transfer, canViewTransferAudit(actor)),
    ),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function createTransfer(
  actor: AuthContext,
  input: CreateTransferInput,
) {
  assertCapability(actor, "stock-transfers:create");
  await assertSourceActor(actor);
  const productIds = input.lines.map((line) => line.productId);
  if (new Set(productIds).size !== productIds.length)
    throw new TransferError(
      "INVALID_LINES",
      "A product may appear only once",
      400,
    );
  return prisma.$transaction(
    async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, status: "ACTIVE" },
        select: { id: true },
      });
      if (products.length !== productIds.length) {
        throw new TransferError(
          "INVALID_LINES",
          "Every transfer product must be active",
          400,
        );
      }
      const destination = await findActiveBranch(input.destinationId, tx);
      if (!destination)
        throw new TransferError(
          "INVALID_DESTINATION",
          "Destination must be an active branch",
          400,
        );

      const existingDraft = await tx.stockTransfer.findFirst({
        where: { destinationId: destination.id, status: "DRAFT" },
        select: { id: true },
      });
      if (existingDraft) {
        throw new TransferError(
          "DUPLICATE_DRAFT",
          "A draft for this destination already exists. Edit that draft instead.",
        );
      }

      let replacementReference = "";
      if (input.replacementForTransferId) {
        const sourceTransfer = await tx.stockTransfer.findFirst({
          where: {
            id: input.replacementForTransferId,
            destinationId: destination.id,
            status: "RESOLVED",
          },
          select: { reference: true },
        });
        if (!sourceTransfer)
          throw new TransferError(
            "INVALID_REPLACEMENT",
            "Replacement source must be a resolved transfer for the same branch",
            400,
          );
        replacementReference = sourceTransfer.reference;
      }

      const transfer = await tx.stockTransfer.create({
        data: {
          reference: `ST-${randomUUID()}`,
          destinationId: destination.id,
          createdById: actor.userId,
          lines: {
            create: input.lines.map((line) => ({
              productId: line.productId,
              requestedQuantity: line.quantity,
            })),
          },
        },
        include: TRANSFER_INCLUDE,
      });

      if (replacementReference) {
        await notifyUsersForTransfer(
          tx,
          transfer,
          [{ capability: "stock-transfers:update", locationId: await stockRoomId(tx) }],
          {
            title: "Replacement transfer draft created",
            description: `${transfer.reference} was created as a replacement draft for shortage from ${replacementReference}.`,
            type: "INFO",
          },
        );
      }

      return serializeTransfer(transfer, canViewTransferAudit(actor));
    },
    { isolationLevel: "Serializable" },
  );
}

export async function updateDraftTransfer(
  actor: AuthContext,
  id: string,
  version: number,
  lines: { productId: string; quantity: number }[],
) {
  assertCapability(actor, "stock-transfers:update");
  await assertSourceActor(actor);
  if (new Set(lines.map((l) => l.productId)).size !== lines.length)
    throw new TransferError(
      "INVALID_LINES",
      "A product may appear only once",
      400,
    );
  return prisma.$transaction(
    async (tx) => {
      const transfer = await lockTransfer(tx, id);
      if (transfer.status !== "DRAFT")
        throw new TransferError(
          "INVALID_STATE",
          "Only draft transfers can be edited",
        );
      assertVersion(transfer.version, version);
      await tx.stockTransferLine.deleteMany({ where: { transferId: id } });
      await tx.stockTransferLine.createMany({
        data: lines.map((line) => ({
          transferId: id,
          productId: line.productId,
          requestedQuantity: line.quantity,
        })),
      });
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: { version: { increment: 1 } },
        include: TRANSFER_INCLUDE,
      });
      return serializeTransfer(updated, canViewTransferAudit(actor));
    },
    { isolationLevel: "Serializable" },
  );
}

export async function deleteDraftTransfer(actor: AuthContext, id: string) {
  assertCapability(actor, "stock-transfers:delete");
  await assertSourceActor(actor);
  await prisma.$transaction(
    async (tx) => {
      const transfer = await tx.stockTransfer.findUnique({
        where: { id },
        include: { destination: { select: { name: true } } },
      });
      if (!transfer)
        throw new TransferError("NOT_FOUND", "Transfer not found", 404);
      if (transfer.status !== "DRAFT" && transfer.status !== "FOR_DISPATCH")
        throw new TransferError(
          "INVALID_STATE",
          "Only draft or ready for dispatch transfers can be deleted",
        );
      const recipients = await tx.user.findMany({
        where: {
          status: "ACTIVE",
          OR: [{ id: actor.userId }, { accessRole: { isOwner: true } }],
        },
        select: { id: true },
      });
      await tx.stockTransferLine.deleteMany({ where: { transferId: id } });
      await tx.stockTransfer.delete({ where: { id } });
      await createNotifications(
        tx,
        recipients.map((recipient) => ({
          userId: recipient.id,
          title: "Transfer draft deleted",
          description: `${transfer.reference} to ${transfer.destination.name} was deleted.`,
          type: "INFO",
        })),
      );
      return { id };
    },
    { isolationLevel: "Serializable" },
  );
}

export async function finalizeTransfer(
  actor: AuthContext,
  id: string,
  version: number,
) {
  assertCapability(actor, "stock-transfers:finalize");
  await assertSourceActor(actor);
  return prisma.$transaction(
    async (tx) => {
      const transfer = await lockTransfer(tx, id);
      if (transfer.status === "FOR_DISPATCH")
        return serializeTransfer(transfer, canViewTransferAudit(actor));
      assertVersion(transfer.version, version);
      if (transfer.status !== "DRAFT")
        throw new TransferError(
          "INVALID_STATE",
          "Only draft transfers can be finalized",
        );
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: {
          status: "FOR_DISPATCH",
          finalizedById: actor.userId,
          finalizedAt: new Date(),
          version: { increment: 1 },
        },
        include: TRANSFER_INCLUDE,
      });
      await notifyUsersForTransfer(
        tx,
        updated,
        [{ capability: "stock-transfers:dispatch", locationId: await stockRoomId(tx) }],
        {
          title: "Transfer ready to dispatch",
          description: `${updated.reference} to ${updated.destination.name} is finalized and waiting for Stock Room dispatch.`,
          type: "INFO",
        },
      );
      return serializeTransfer(updated, canViewTransferAudit(actor));
    },
    { isolationLevel: "Serializable" },
  );
}

export async function dispatchTransfer(
  actor: AuthContext,
  id: string,
  version: number,
) {
  assertCapability(actor, "stock-transfers:dispatch");
  await assertSourceActor(actor);
  return prisma.$transaction(
    async (tx) => {
      const transfer = await lockTransfer(tx, id);
      if (transfer.status === "IN_TRANSIT")
        return serializeTransfer(transfer, canViewTransferAudit(actor));
      assertVersion(transfer.version, version);
      if (transfer.status !== "FOR_DISPATCH")
        throw new TransferError(
          "INVALID_STATE",
          "Only finalized transfers can be dispatched",
        );
      const sr = await stockRoomId(tx);
      for (const line of transfer.lines) {
        await decreaseAvailableBalance(
          tx,
          sr,
          line.productId,
          line.requestedQuantity,
        );
        await tx.stockTransferLine.update({
          where: { id: line.id },
          data: {
            dispatchedQuantity: line.requestedQuantity,
            inTransitQuantity: line.requestedQuantity,
          },
        });
        await tx.inventoryMovement.create({
          data: {
            transferId: id,
            productId: line.productId,
            locationId: sr,
            quantity: -line.requestedQuantity,
            type: "TRANSFER_DISPATCH",
            actorId: actor.userId,
          },
        });
      }
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: {
          status: "IN_TRANSIT",
          dispatchedById: actor.userId,
          dispatchedAt: new Date(),
          version: { increment: 1 },
        },
        include: TRANSFER_INCLUDE,
      });
      await notifyUsersForTransfer(
        tx,
        updated,
        [{ capability: "stock-transfers:receive", locationId: updated.destinationId }],
        {
          title: "Transfer ready for receiving",
          description: `${updated.reference} from Stock Room is in transit to ${updated.destination.name}. Count items before confirming.`,
          type: "INFO",
        },
      );
      return serializeTransfer(updated, canViewTransferAudit(actor));
    },
    { isolationLevel: "Serializable" },
  );
}

export async function confirmReceipt(
  actor: AuthContext,
  id: string,
  version: number,
) {
  assertCapability(actor, "stock-transfers:receive");
  return prisma.$transaction(
    async (tx) => {
      const transfer = await lockTransfer(tx, id);
      ensureBranchScope(actor, transfer.destinationId);
      if (transfer.status === "RECEIVED")
        return serializeTransfer(transfer, canViewTransferAudit(actor));
      assertVersion(transfer.version, version);
      if (transfer.status !== "IN_TRANSIT")
        throw new TransferError(
          "INVALID_STATE",
          "Only in-transit transfers can be received",
        );
      for (const line of transfer.lines) {
        await increaseBalance(
          tx,
          transfer.destinationId,
          line.productId,
          line.inTransitQuantity,
        );
        await tx.stockTransferLine.update({
          where: { id: line.id },
          data: { inTransitQuantity: 0 },
        });
        await tx.inventoryMovement.create({
          data: {
            transferId: id,
            productId: line.productId,
            locationId: transfer.destinationId,
            quantity: line.dispatchedQuantity,
            type: "TRANSFER_RECEIPT",
            actorId: actor.userId,
          },
        });
      }
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: {
          status: "RECEIVED",
          receivedById: actor.userId,
          receivedAt: new Date(),
          version: { increment: 1 },
        },
        include: TRANSFER_INCLUDE,
      });
      await notifyUsersForTransfer(
        tx,
        updated,
        [{ capability: "stock-transfers:investigate", locationId: await stockRoomId(tx) }],
        {
          title: "Transfer receipt confirmed",
          description: `${updated.reference} was counted and received by ${updated.destination.name} with no discrepancy.`,
          type: "SUCCESS",
        },
      );
      return serializeTransfer(updated, canViewTransferAudit(actor));
    },
    { isolationLevel: "Serializable" },
  );
}

export async function reportDiscrepancy(
  actor: AuthContext,
  id: string,
  input: DiscrepancyInput,
) {
  assertCapability(actor, "stock-transfers:report-discrepancy");
  return prisma.$transaction(
    async (tx) => {
      const transfer = await lockTransfer(tx, id);
      ensureBranchScope(actor, transfer.destinationId);
      if (transfer.status === "DISCREPANCY_REPORTED")
        return serializeTransfer(transfer, canViewTransferAudit(actor));
      assertVersion(transfer.version, input.version);
      if (transfer.status !== "IN_TRANSIT")
        throw new TransferError(
          "INVALID_STATE",
          "Only in-transit transfers can be reported",
        );
      if (
        input.lines.length !== transfer.lines.length ||
        new Set(input.lines.map((line) => line.lineId)).size !==
          transfer.lines.length
      )
        throw new TransferError(
          "INVALID_LINES",
          "Report every dispatched line",
          400,
        );
      for (const line of input.lines) {
        const dispatched = transfer.lines.find(
          (item) => item.id === line.lineId,
        );
        if (!dispatched || line.actualQuantity > dispatched.dispatchedQuantity)
          throw new TransferError(
            "INVALID_LINES",
            "Actual quantity must not exceed dispatched quantity",
            400,
          );
      }
      if (
        input.lines.every(
          (line) =>
            transfer.lines.find((item) => item.id === line.lineId)
              ?.dispatchedQuantity === line.actualQuantity,
        ) &&
        input.lines.every((line) => line.reason === "Items missing")
      ) {
        throw new TransferError(
          "INVALID_DISCREPANCY",
          "Use exact receipt when every item count matches",
          400,
        );
      }
      await tx.stockTransferDiscrepancy.create({
        data: {
          transferId: id,
          reportedById: actor.userId,
          notes: input.notes,
          lines: {
            create: input.lines.map((line) => ({
              transferLineId: line.lineId,
              actualQuantity: line.actualQuantity,
              reason: line.reason,
              notes: line.notes,
            })),
          },
        },
      });
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: { status: "DISCREPANCY_REPORTED", version: { increment: 1 } },
        include: TRANSFER_INCLUDE,
      });
      await notifyUsersForTransfer(
        tx,
        updated,
        [{ capability: "stock-transfers:investigate", locationId: await stockRoomId(tx) }],
        {
          title: "Discrepancy needs investigation",
          description: `${updated.reference} from ${updated.destination.name} has a reported receiving discrepancy.`,
          type: "WARNING",
        },
      );
      return serializeTransfer(updated, canViewTransferAudit(actor));
    },
    { isolationLevel: "Serializable" },
  );
}

export async function submitInvestigation(
  actor: AuthContext,
  id: string,
  input: InvestigationInput,
) {
  assertCapability(actor, "stock-transfers:investigate");
  await assertSourceActor(actor);
  return prisma.$transaction(
    async (tx) => {
      const transfer = await lockTransfer(tx, id);
      if (transfer.status === "UNDER_REVIEW")
        return serializeTransfer(transfer, canViewTransferAudit(actor));
      assertVersion(transfer.version, input.version);
      if (transfer.status !== "DISCREPANCY_REPORTED")
        throw new TransferError(
          "INVALID_STATE",
          "Only reported discrepancies can be investigated",
        );
      await tx.stockTransferInvestigation.create({
        data: {
          transferId: id,
          submittedById: actor.userId,
          findings: input.findings,
        },
      });
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: { status: "UNDER_REVIEW", version: { increment: 1 } },
        include: TRANSFER_INCLUDE,
      });
      await notifyUsersForTransfer(tx, updated, [{ capability: "stock-transfers:resolve" }], {
        title: "Discrepancy ready for approval",
        description: `${updated.reference} has Stock Staff investigation and needs final Admin resolution.`,
        type: "WARNING",
      });
      return serializeTransfer(updated, canViewTransferAudit(actor));
    },
    { isolationLevel: "Serializable" },
  );
}

export async function resolveTransfer(
  actor: AuthContext,
  id: string,
  input: ResolutionInput,
) {
  assertCapability(actor, "stock-transfers:resolve");
  await assertSourceActor(actor);
  return prisma.$transaction(
    async (tx) => {
      const transfer = await lockTransfer(tx, id);
      ensureBranchScope(actor, transfer.destinationId);
      if (transfer.status === "RESOLVED")
        return serializeTransfer(transfer, canViewTransferAudit(actor));
      assertVersion(transfer.version, input.version);
      if (transfer.status !== "UNDER_REVIEW")
        throw new TransferError(
          "INVALID_STATE",
          "Only investigated discrepancies can be resolved",
        );
      if (input.lines.length !== transfer.lines.length)
        throw new TransferError(
          "INVALID_LINES",
          "Resolve every dispatched line",
          400,
        );
      if (
        new Set(input.lines.map((line) => line.lineId)).size !==
        transfer.lines.length
      ) {
        throw new TransferError(
          "INVALID_LINES",
          "Resolve every dispatched line once",
          400,
        );
      }
      for (const item of input.lines) {
        const line = transfer.lines.find(
          (candidate) => candidate.id === item.lineId,
        );
        if (
          !line ||
          item.destinationQuantity +
            item.restoreToSrQuantity +
            item.lossQuantity !==
            line.inTransitQuantity
        )
          throw new TransferError(
            "UNBALANCED_RESOLUTION",
            "Each resolution line must account for all in-transit quantity",
            400,
          );
      }
      const sr = await tx.location.findFirstOrThrow({
        where: { code: "SR", type: "WAREHOUSE", isActive: true },
        select: { id: true },
      });
      await tx.stockTransferResolution.create({
        data: {
          transferId: id,
          postedById: actor.userId,
          notes: input.notes,
          lines: {
            create: input.lines.map((line) => ({
              transferLineId: line.lineId,
              destinationQty: line.destinationQuantity,
              restoreToSrQty: line.restoreToSrQuantity,
              lossQty: line.lossQuantity,
            })),
          },
        },
      });
      for (const item of input.lines) {
        const line = transfer.lines.find(
          (candidate) => candidate.id === item.lineId,
        )!;
        if (item.destinationQuantity) {
          await increaseBalance(
            tx,
            transfer.destinationId,
            line.productId,
            item.destinationQuantity,
          );
          await tx.inventoryMovement.create({
            data: {
              transferId: id,
              productId: line.productId,
              locationId: transfer.destinationId,
              quantity: item.destinationQuantity,
              type: "TRANSFER_RESOLUTION",
              actorId: actor.userId,
            },
          });
        }
        if (item.restoreToSrQuantity) {
          await increaseBalance(
            tx,
            sr.id,
            line.productId,
            item.restoreToSrQuantity,
          );
          await tx.inventoryMovement.create({
            data: {
              transferId: id,
              productId: line.productId,
              locationId: sr.id,
              quantity: item.restoreToSrQuantity,
              type: "TRANSFER_RESTORATION",
              actorId: actor.userId,
            },
          });
        }
        if (item.lossQuantity)
          await tx.inventoryMovement.create({
            data: {
              transferId: id,
              productId: line.productId,
              quantity: -item.lossQuantity,
              type: "TRANSFER_LOSS",
              actorId: actor.userId,
            },
          });
        await tx.stockTransferLine.update({
          where: { id: line.id },
          data: { inTransitQuantity: 0 },
        });
      }
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: { status: "RESOLVED", version: { increment: 1 } },
        include: TRANSFER_INCLUDE,
      });
      await notifyUsersForTransfer(
        tx,
        updated,
        [
          { capability: "stock-transfers:resolve" },
          { capability: "stock-transfers:receive", locationId: updated.destinationId },
        ],
        {
          title: "Transfer discrepancy resolved",
          description: `${updated.reference} for ${updated.destination.name} has been closed with final inventory posting.`,
          type: "SUCCESS",
        },
      );
      return serializeTransfer(updated, canViewTransferAudit(actor));
    },
    { isolationLevel: "Serializable" },
  );
}

function actorLabel(actor: { name: string } | null) {
  return actor?.name ?? "System";
}

function serializeTransfer(transfer: TransferRecord, includeAudit = false) {
  const timeline = includeAudit
    ? [
        {
          label: "Draft created",
          actor: actorLabel(transfer.createdBy),
          at: transfer.createdAt.toISOString(),
        },
        transfer.finalizedAt
          ? {
              label: "Finalized for dispatch",
              actor: actorLabel(transfer.finalizedBy),
              at: transfer.finalizedAt.toISOString(),
            }
          : null,
        transfer.dispatchedAt
          ? {
              label: "Dispatched from Stock Room",
              actor: actorLabel(transfer.dispatchedBy),
              at: transfer.dispatchedAt.toISOString(),
            }
          : null,
        transfer.receivedAt
          ? {
              label: "Exact receipt confirmed",
              actor: actorLabel(transfer.receivedBy),
              at: transfer.receivedAt.toISOString(),
            }
          : null,
        transfer.discrepancy
          ? {
              label: "Discrepancy reported",
              actor: actorLabel(transfer.discrepancy.reportedBy),
              at: transfer.discrepancy.reportedAt.toISOString(),
              notes: transfer.discrepancy.notes,
            }
          : null,
        transfer.investigation
          ? {
              label: "Investigation submitted",
              actor: actorLabel(transfer.investigation.submittedBy),
              at: transfer.investigation.submittedAt.toISOString(),
              notes: transfer.investigation.findings,
            }
          : null,
        transfer.resolution
          ? {
              label: "Admin resolution approved",
              actor: actorLabel(transfer.resolution.postedBy),
              at: transfer.resolution.postedAt.toISOString(),
              notes: transfer.resolution.notes,
            }
          : null,
      ].filter(Boolean)
    : undefined;

  return {
    id: transfer.id,
    reference: transfer.reference,
    status: transfer.status as StockTransferStatus,
    version: transfer.version,
    destination: transfer.destination,
    createdAt: transfer.createdAt.toISOString(),
    lines: transfer.lines.map((line) => ({
      id: line.id,
      product: line.product,
      requestedQuantity: line.requestedQuantity,
      dispatchedQuantity: line.dispatchedQuantity,
      inTransitQuantity: line.inTransitQuantity,
      discrepancy:
        transfer.discrepancy?.lines.find(
          (item) => item.transferLineId === line.id,
        ) ?? null,
      resolution:
        transfer.resolution?.lines.find(
          (item) => item.transferLineId === line.id,
        ) ?? null,
    })),
    discrepancy: transfer.discrepancy
      ? {
          notes: transfer.discrepancy.notes,
          reportedAt: transfer.discrepancy.reportedAt.toISOString(),
        }
      : null,
    investigation: transfer.investigation
      ? {
          findings: transfer.investigation.findings,
          submittedAt: transfer.investigation.submittedAt.toISOString(),
        }
      : null,
    resolution: transfer.resolution
      ? {
          notes: transfer.resolution.notes,
          postedAt: transfer.resolution.postedAt.toISOString(),
        }
      : null,
    timeline,
    movements: includeAudit
      ? transfer.movements.map((movement) => ({
          id: movement.id,
          type: movement.type,
          quantity: movement.quantity,
          occurredAt: movement.occurredAt.toISOString(),
          actor: actorLabel(movement.actor),
          product: movement.product,
          location: movement.location,
        }))
      : undefined,
  };
}
