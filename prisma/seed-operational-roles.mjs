import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

/**
 * Creates the three roles the business actually staffs: a Branch Manager for
 * each branch, Accounting, and Inventory. Only the roles. Who holds them, and
 * which branches they reach, is assigned per user in User Management, because
 * a role here is business-wide and the location scope lives on the user.
 *
 * The capability ids are read out of lib/contracts/roles.ts rather than copied,
 * so a capability that is renamed or removed stops this script instead of
 * quietly seeding a permission that grants nothing. Prerequisites from
 * lib/permissions.ts are pulled in automatically, so each list below only has
 * to name the work the role does.
 *
 * Reports only unless --apply is given, so the first run always shows what
 * would happen. Safe to run again: it writes a role only when its permissions
 * differ from the target, and reports the rest unchanged.
 *
 *   export DATABASE_URL='postgresql://<user>:<password>@<host>:<port>/<database>'
 *   node prisma/seed-operational-roles.mjs
 *   node prisma/seed-operational-roles.mjs --apply
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG_FILE = resolve(HERE, "../lib/contracts/roles.ts");
const IMPLIED_FILE = resolve(HERE, "../lib/permissions.ts");

/**
 * Branch-scoped: no locations:all, so a Branch Manager sees only the branches
 * assigned to them. Verification here is the branch side of the conversation —
 * confirming, answering a mismatch, attaching the receipt photo. Voiding a
 * posted sale and overruling the branch's own encoding are deliberately left
 * out: the branch that recorded the money should not be the one to erase it.
 */
const BRANCH_MANAGER = [
  "dashboard:view",
  "notifications:mark-read",
  "customers:create", "customers:update",
  "customer-orders:create", "customer-orders:reserve", "customer-orders:record-payment",
  "customer-orders:release", "customer-orders:cancel",
  "sales:post", "sales:correction:request",
  "sales:verify", "sales:mismatch:respond", "sales:evidence:upload",
  "products:view",
  "inventory-availability:view", "inventory:adjust",
  "stock-receipts:view", "inventory-receiving:create",
  "stock-transfers:create", "stock-transfers:update", "stock-transfers:delete",
  "stock-transfers:finalize", "stock-transfers:dispatch", "stock-transfers:cancel",
  "stock-transfers:receive", "stock-transfers:report-discrepancy", "stock-transfers:audit:view",
  "reports:sales", "reports:salesperson-sales", "reports:inventory-summary",
  "reports:stock-movement", "reports:returns-warranty",
  "offline-sales:snapshot", "offline-sales:sync",
  "personnel:view",
  "backjobs:create", "backjobs:update", "backjobs:schedule", "backjobs:complete",
  "backjobs:parts:issue", "backjobs:parts:return", "backjobs:print",
  "customer-warranties:create", "customer-warranties:photos:add",
  "customer-warranties:receive-quarantine", "customer-warranties:assess",
  "customer-warranties:approve", "customer-warranties:release",
  "customer-warranties:complete", "customer-warranties:print",
  "supplier-claims:create", "supplier-claims:manage", "supplier-claims:return-stock",
  "supplier-claims:receive-replacement", "supplier-claims:repair-stock",
  "supplier-claims:evidence", "supplier-claims:print",
];

/**
 * All locations, because money is reviewed across the business rather than
 * branch by branch. This is the side that can overrule a branch's encoding,
 * void a sale, and settle a claim for cash or credit. It reads inventory but
 * never moves it.
 */
const ACCOUNTING = [
  "locations:all",
  "dashboard:view",
  "notifications:mark-read",
  "customers:view",
  "customer-orders:record-payment", "customer-orders:cancel-paid",
  "sales:view", "sales:salesperson:update",
  "sales:verify", "sales:resolve", "sales:void-replace", "sales:mismatch:respond",
  "sales:evidence:upload", "sales:evidence:delete",
  "products:view",
  "inventory-availability:view", "inventory-movements:view",
  "stock-transfers:view", "stock-transfers:audit:view",
  "reports:sales", "reports:salesperson-sales", "reports:inventory-summary",
  "reports:stock-movement", "reports:returns-warranty",
  "supplier-claims:record-monetary-resolution", "supplier-claims:approve-writeoff",
  "supplier-claims:close",
  "personnel:view",
  "audit:view",
];

/**
 * All locations, because stock moves between branches and the person chasing a
 * transfer has to see both ends. Owns the catalogue and the suppliers behind
 * it, and is the one who arbitrates a transfer discrepancy. No access to sales
 * or to money.
 */
const INVENTORY = [
  "locations:all",
  "dashboard:view",
  "notifications:mark-read",
  "products:create", "products:update", "products:image:update",
  "suppliers:create", "suppliers:update", "suppliers:deactivate",
  "inventory-availability:view", "inventory:adjust",
  "stock-receipts:view", "inventory-receiving:create",
  "stock-transfers:create", "stock-transfers:update", "stock-transfers:delete",
  "stock-transfers:finalize", "stock-transfers:dispatch", "stock-transfers:cancel",
  "stock-transfers:receive", "stock-transfers:report-discrepancy",
  "stock-transfers:investigate", "stock-transfers:resolve", "stock-transfers:audit:view",
  "reports:inventory-summary", "reports:stock-movement", "reports:returns-warranty",
  "customer-warranties:receive-quarantine", "customer-warranties:assess",
  "customer-warranties:release",
  "supplier-claims:create", "supplier-claims:manage", "supplier-claims:return-stock",
  "supplier-claims:receive-replacement", "supplier-claims:repair-stock",
  "supplier-claims:evidence", "supplier-claims:print", "supplier-claims:close",
];

const ROLE_SPECS = [
  {
    key: "role-branch-manager",
    name: "Branch Manager",
    description:
      "Runs one branch: selling, orders, stock on hand, transfers in and out, and returns. Assign the branch on the user.",
    permissions: BRANCH_MANAGER,
  },
  {
    key: "role-accounting",
    name: "Accounting",
    description:
      "Reviews receipts and settles money across every branch. Reads stock but does not move it.",
    permissions: ACCOUNTING,
  },
  {
    key: "role-inventory",
    name: "Inventory",
    description:
      "Owns the catalogue, suppliers, receiving, and transfers between branches. No access to sales.",
    permissions: INVENTORY,
  },
];

/** Every capability id, in the order the catalogue declares them. */
export function readCapabilityOrder(source) {
  const body = source.slice(
    source.indexOf("export const CAPABILITY_CATALOG"),
    source.indexOf("] as const;"),
  );
  const ids = [...body.matchAll(/\{\s*id:\s*"([^"]+)"/g)].map((match) => match[1]);
  if (ids.length === 0) throw new Error("Could not read CAPABILITY_CATALOG from lib/contracts/roles.ts");
  return ids;
}

/** capability -> the capabilities it cannot work without. */
export function readImpliedCapabilities(source) {
  const start = source.indexOf("const IMPLIED_CAPABILITIES");
  if (start < 0) throw new Error("Could not read IMPLIED_CAPABILITIES from lib/permissions.ts");
  const body = source.slice(start, source.indexOf("};", start));
  const implied = new Map();
  for (const [, id, list] of body.matchAll(/"([^"]+)":\s*\[([^\]]*)\]/g)) {
    implied.set(id, [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1]));
  }
  return implied;
}

/** Adds every prerequisite, and every prerequisite of those, until none are new. */
export function expandImplied(permissions, implied) {
  const resolved = new Set(permissions);
  const pending = [...permissions];
  while (pending.length > 0) {
    for (const prerequisite of implied.get(pending.pop()) ?? []) {
      if (!resolved.has(prerequisite)) {
        resolved.add(prerequisite);
        pending.push(prerequisite);
      }
    }
  }
  return resolved;
}

export function buildRoleTargets(specs, catalogOrder, implied) {
  const known = new Set(catalogOrder);
  return specs.map((spec) => {
    const unknown = spec.permissions.filter((permission) => !known.has(permission));
    if (unknown.length > 0) {
      throw new Error(`${spec.name} names capabilities that no longer exist: ${unknown.join(", ")}`);
    }
    const resolved = expandImplied(spec.permissions, implied);
    // Catalogue order, which is the order the server stores and the screen
    // lists, so a re-run compares equal instead of looking changed.
    return { ...spec, permissions: catalogOrder.filter((id) => resolved.has(id)) };
  });
}

function same(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export async function seedOperationalRoles(prisma, { apply = false, specs = ROLE_SPECS } = {}) {
  const catalogOrder = readCapabilityOrder(readFileSync(CATALOG_FILE, "utf8"));
  const implied = readImpliedCapabilities(readFileSync(IMPLIED_FILE, "utf8"));
  const targets = buildRoleTargets(specs, catalogOrder, implied);

  const results = [];
  for (const target of targets) {
    const existing = await prisma.roleDefinition.findUnique({
      where: { key: target.key },
      select: { id: true, name: true, isOwner: true, permissions: true, version: true },
    });

    if (existing?.isOwner) {
      // The owner already reaches everything; rewriting it could only take
      // access away from the one account that administers the system.
      results.push({ role: target.name, action: "refused", reason: "This key belongs to the owner role" });
      continue;
    }

    if (!existing) {
      results.push({ role: target.name, action: "create", permissions: target.permissions.length });
      if (apply) {
        await prisma.roleDefinition.create({
          data: {
            key: target.key,
            name: target.name,
            description: target.description,
            // Retained only for compatibility with the additive legacy schema.
            scope: "BUSINESS_WIDE",
            permissions: target.permissions,
          },
        });
      }
      continue;
    }

    if (same(existing.permissions, target.permissions)) {
      results.push({ role: target.name, action: "unchanged", permissions: target.permissions.length });
      continue;
    }

    const added = target.permissions.filter((id) => !existing.permissions.includes(id));
    const removed = existing.permissions.filter((id) => !target.permissions.includes(id));
    results.push({ role: target.name, action: "update", added, removed });
    if (apply) {
      await prisma.roleDefinition.update({
        where: { key: target.key },
        data: {
          name: target.name,
          description: target.description,
          permissions: target.permissions,
          version: { increment: 1 },
        },
      });
    }
  }

  return { applied: apply, roles: results };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const prisma = new PrismaClient();
  try {
    const result = await seedOperationalRoles(prisma, { apply });
    console.log(JSON.stringify(result, null, 2));
    if (!apply) console.log("\nNothing was written. Re-run with --apply to write these roles.");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Role seed failed");
    process.exit(1);
  });
}
