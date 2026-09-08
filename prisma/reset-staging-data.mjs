import { readFile, readdir } from "node:fs/promises";

import { Prisma } from "@prisma/client";
import pg from "pg";

// Reviewed child-before-parent order. New models require an explicit reset decision.
const DELETE_ORDER = [
  "PushDeliveryAttempt", "PushSubscription", "Notification",
  "OfflineSaleSubmission", "OfflineSyncOperation", "OfflineDeviceActivation",
  "SupplierClaimEvidence", "SupplierClaimSettlement", "SupplierClaimAction",
  "CustomerWarrantyAction", "CustomerWarrantyEvent",
  "BackjobAttachment", "BackjobScheduleHistory", "BackjobEvent",
  "InventoryMovement", "SupplierClaimLine", "SupplierClaim", "CustomerWarranty",
  "BackjobPart", "BackjobItem", "Backjob", "SaleCorrectionRequest",
  "SaleAccountingReview", "SaleLine", "ManualReceipt", "Sale",
  "CustomerOrderLine", "CustomerOrderSalespersonEvent", "CustomerOrder", "Customer",
  "StockTransferResolutionLine", "StockTransferResolution", "StockTransferInvestigation",
  "StockTransferDiscrepancyLine", "StockTransferDiscrepancy", "StockTransferLine",
  "StockTransfer", "StockReceiptLine", "StockReceipt", "InventoryBalance",
  "ProductVehicleCompatibility", "Product", "Supplier", "Personnel",
  "Session", "Verification", "Account", "UserLocation", "User", "RoleDefinition",
];
const TABLES = [...DELETE_ORDER, "Location", "_prisma_migrations"].sort();
const ACCOUNT_TOKENS = [
  "accessToken", "refreshToken", "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt",
];
const AUDIT_TRIGGERS = [
  "CustomerWarrantyAction.CustomerWarrantyAction_immutable",
  "CustomerWarrantyEvent.CustomerWarrantyEvent_immutable",
  "CustomerOrderSalespersonEvent.CustomerOrderSalespersonEvent_immutable",
].sort();
const qualified = (table) => `"public"."${table}"`;

function requireValue(name) {
  const value = process.env[name];
  if (!value || value !== value.trim() || /[\r\n]/.test(value) || /[<>]/.test(value)) {
    throw new Error(`${name} must be supplied explicitly, without placeholders or surrounding whitespace`);
  }
  return value;
}

function assertSame(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} differs; refusing staging reset`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--apply")) {
    throw new Error("Usage: npm run db:staging:reset [-- --apply]; no flag means dry-run");
  }
  const apply = args[0] === "--apply";
  if (process.env.APP_ENV !== "staging") {
    throw new Error("APP_ENV=staging is required; NODE_ENV is not the deployment identity");
  }
  const databaseUrl = requireValue("DATABASE_URL");
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname ||
      !url.username || !url.pathname.slice(1) || url.hash) {
    throw new Error("DATABASE_URL must explicitly identify a PostgreSQL host, user, and database");
  }
  // Do not permit query parameters to redirect pg to another host/database or schema.
  for (const [key, value] of url.searchParams) {
    if ((key !== "schema" && key !== "sslmode") ||
        url.searchParams.getAll(key).length !== 1 ||
        (key === "schema" && value !== "public") ||
        (key === "sslmode" && !["disable", "require", "verify-ca", "verify-full"].includes(value))) {
      throw new Error("DATABASE_URL only supports schema=public and sslmode=disable/require/verify-ca/verify-full for this tool");
    }
  }
  const target = {
    host: requireValue("STAGING_RESET_HOST"),
    port: requireValue("STAGING_RESET_PORT"),
    database: requireValue("STAGING_RESET_DATABASE"),
    ownerId: requireValue("STAGING_RESET_OWNER_ID"),
    ownerEmail: requireValue("STAGING_RESET_OWNER_EMAIL"),
    roleId: requireValue("STAGING_RESET_ROLE_ID"),
  };
  assertSame(url.hostname, target.host, "URL host");
  assertSame(url.port || "5432", target.port, "URL port");
  assertSame(decodeURIComponent(url.pathname.slice(1)), target.database, "URL database");
  if (/^(localhost\.?|127\..*|\[::1\]|\[::ffff:.*\]|0\.0\.0\.0|host\.docker\.internal)$/i.test(target.host) ||
      ["chezcar_test_01_13", "postgres", "template0", "template1"].includes(target.database) ||
      [target.host, target.database].some((value) => /(^|[_.-])(local|dev|development|test|testing)([_.-]|$)/i.test(value))) {
    throw new Error("Refusing a local/development/test or maintenance target; use the separately identified staging database");
  }
  const confirmation = `RESET STAGING ${target.host}:${target.port}/${target.database} OWNER ${target.ownerId} ${target.ownerEmail} ROLE ${target.roleId}`;
  assertSame(requireValue("STAGING_RESET_CONFIRM"), confirmation, "STAGING_RESET_CONFIRM");

  const models = Prisma.dmmf.datamodel.models;
  const modelNames = [...DELETE_ORDER, "Location"].sort();
  assertSame(models.map((model) => model.name).sort(), modelNames, "Generated Prisma model inventory");
  const schema = await readFile(new URL("./schema.prisma", import.meta.url), "utf8");
  assertSame([...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]).sort(),
    modelNames, "Source Prisma model inventory");
  if (models.some((model) => model.dbName && model.dbName !== model.name)) {
    throw new Error("Mapped model tables require review of this reset tool");
  }
  const migrationNames = (await readdir(new URL("./migrations/", import.meta.url), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000 });
  let inTransaction = false;
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    inTransaction = true;
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '60s'");
    await client.query("SET LOCAL search_path = pg_catalog, public");
    await client.query("SET LOCAL row_security = off");
    const { rows: [lock] } = await client.query("SELECT pg_try_advisory_xact_lock(739214, 20260908) AS acquired");
    if (!lock.acquired) throw new Error("Another staging reset holds the transaction lock");
    const { rows: [identity] } = await client.query(`
      SELECT current_database() AS database, inet_server_addr()::text AS "serverAddress",
             inet_server_port() AS "serverPort", current_user AS "databaseUser",
             pg_is_in_recovery() AS replica
    `);
    assertSame(identity.database, target.database, "Connected current_database()");
    if (identity.replica) throw new Error("Refusing a read replica");

    async function checkTables() {
      const { rows } = await client.query(`
        SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind,
               c.relrowsecurity AS rls, c.relispartition AS partition
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p', 'f', 'm')
          AND n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
        ORDER BY n.nspname, c.relname
      `);
      assertSame(rows.map((row) => `${row.schema}.${row.name}`).sort(),
        TABLES.map((table) => `public.${table}`).sort(), "Connected table inventory (missing/unknown tables)");
      if (rows.some((row) => row.kind !== "r" || row.rls || row.partition)) {
        throw new Error("Partitioned, foreign, materialized, or RLS tables require manual review");
      }
    }
    await checkTables();
    // Exclusive locks also protect owner/role/credentials, preserved locations, and migration history.
    // READ COMMITTED sees all writes completed before these locks, then no writer can change the snapshot.
    await client.query(`LOCK TABLE ${TABLES.map(qualified).join(", ")} IN ACCESS EXCLUSIVE MODE`);
    await checkTables();
    const { rows: inherited } = await client.query("SELECT 1 FROM pg_inherits LIMIT 1");
    if (inherited.length) throw new Error("Inherited tables require manual review");
    const { rows: columns } = await client.query(`
      SELECT table_name AS table, column_name AS name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
    `);
    assertSame(columns.map((column) => `${column.table}.${column.name}`).sort(),
      models.flatMap((model) => model.fields.filter((field) => field.kind !== "object")
        .map((field) => `${model.name}.${field.dbName || field.name}`)).sort(), "Database/Prisma column inventory");
    const { rows: migrations } = await client.query(`SELECT * FROM "public"."_prisma_migrations" ORDER BY id`);
    if (migrations.some((migration) => !migration.finished_at && !migration.rolled_back_at)) {
      throw new Error("Unresolved migration failure; reset is not a migration repair tool");
    }
    assertSame(migrations.filter((migration) => migration.finished_at && !migration.rolled_back_at)
      .map((migration) => migration.migration_name).sort(), migrationNames, "Applied/image migration inventory");
    const { rows: triggers } = await client.query(`
      SELECT c.relname AS table, t.tgname AS name, t.tgenabled AS enabled,
             pg_get_functiondef(t.tgfoid) AS definition
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT t.tgisinternal AND n.nspname = 'public'
    `);
    assertSame(triggers.map((trigger) => `${trigger.table}.${trigger.name}`).sort(), AUDIT_TRIGGERS, "Audit trigger inventory");
    if (triggers.some((trigger) => !["O", "A"].includes(trigger.enabled) ||
        !trigger.definition.includes("current_setting('chezcar.operational_data_reset', true)"))) {
      throw new Error("Immutable audit triggers are not enabled/reset-aware; review migrations");
    }
    const { rows: foreignKeys } = await client.query(`
      SELECT child.relname AS child, parent.relname AS parent,
             cn.nspname AS "childSchema", pn.nspname AS "parentSchema", con.convalidated AS validated
      FROM pg_constraint con JOIN pg_class child ON child.oid = con.conrelid
      JOIN pg_class parent ON parent.oid = con.confrelid
      JOIN pg_namespace cn ON cn.oid = child.relnamespace
      JOIN pg_namespace pn ON pn.oid = parent.relnamespace
      WHERE con.contype = 'f' AND (cn.nspname = 'public' OR pn.nspname = 'public')
    `);
    for (const fk of foreignKeys) {
      if (fk.childSchema !== "public" || fk.parentSchema !== "public" || !fk.validated ||
          !modelNames.includes(fk.child) || !modelNames.includes(fk.parent) ||
          (fk.parent !== "Location" && !(fk.child === "Sale" && fk.parent === "Sale") &&
            DELETE_ORDER.indexOf(fk.child) >= DELETE_ORDER.indexOf(fk.parent)) || fk.child === "Location") {
        throw new Error(`Unreviewed foreign key/delete order: ${fk.child} -> ${fk.parent}`);
      }
    }

    const { rows: roles } = await client.query(`SELECT * FROM "public"."RoleDefinition" WHERE "isOwner" = true FOR UPDATE`);
    if (roles.length !== 1 || roles[0].id !== target.roleId) {
      throw new Error("Exactly one explicit isOwner role matching STAGING_RESET_ROLE_ID is required; Admin names/grants are not owner identity");
    }
    const { rows: owners } = await client.query(`SELECT * FROM "public"."User" WHERE "roleDefinitionId" = $1 FOR UPDATE`, [target.roleId]);
    if (owners.length !== 1 || owners[0].id !== target.ownerId || owners[0].email !== target.ownerEmail ||
        owners[0].status !== "ACTIVE" || owners[0].banned || owners[0].credentialSetupRequired) {
      throw new Error("Exactly one matching active, unbanned owner with completed credential setup is required");
    }
    const { rows: credentials } = await client.query(`SELECT * FROM "public"."Account" WHERE "userId" = $1 AND "providerId" = 'credential' FOR UPDATE`, [target.ownerId]);
    if (credentials.length !== 1 || credentials[0].accountId !== target.ownerId ||
        typeof credentials[0].password !== "string" || !credentials[0].password.trim()) {
      throw new Error("Owner must already have exactly one nonempty password credential account linked to its user ID");
    }
    const credentialId = credentials[0].id;
    const kept = {
      User: { where: ' WHERE "id" = $1', values: [target.ownerId] },
      RoleDefinition: { where: ' WHERE "id" = $1', values: [target.roleId] },
      Account: { where: ' WHERE "id" = $1', values: [credentialId] },
      UserLocation: { where: ' WHERE "userId" = $1', values: [target.ownerId] },
      Location: { where: "", values: [] },
      _prisma_migrations: { where: "", values: [] },
    };
    async function snapshot(table, filter) {
      // JSONB text retains database timestamp precision and every column, without logging secrets.
      const expression = table === "Account"
        ? `to_jsonb(t) - ARRAY[${ACCOUNT_TOKENS.map((column) => `'${column}'`).join(", ")}]::text[]`
        : "to_jsonb(t)";
      const { rows: [row] } = await client.query(`
        SELECT COALESCE(jsonb_agg(value ORDER BY value::text), '[]'::jsonb)::text AS snapshot
        FROM (SELECT ${expression} AS value FROM ${qualified(table)} t${filter.where}) s
      `, filter.values);
      return row.snapshot;
    }
    const snapshots = {};
    const report = [];
    for (const table of TABLES) {
      const filter = kept[table];
      const { rows: [row] } = await client.query(`SELECT count(*)::text AS count FROM ${qualified(table)}`);
      let retained = "0";
      if (filter) {
        snapshots[table] = await snapshot(table, filter);
        const { rows: [remaining] } = await client.query(`SELECT count(*)::text AS count FROM ${qualified(table)}${filter.where}`, filter.values);
        retained = remaining.count;
      }
      report.push({ table, before: row.count, delete: String(BigInt(row.count) - BigInt(retained)), keep: retained });
    }
    console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY RUN", target, connected: identity }, null, 2));
    console.table(report);
    console.log("Owner credential/password and fields retained; credential token fields will be cleared. All sessions and verification tokens will be deleted. No disk files will be removed.");
    if (!apply) {
      await client.query("ROLLBACK");
      inTransaction = false;
      console.log("Dry-run complete. No rows changed. Apply requires a fresh check with --apply.");
      return;
    }

    await client.query("SELECT set_config('chezcar.operational_data_reset', 'true', true)");
    await client.query(`UPDATE "public"."Account" SET ${ACCOUNT_TOKENS.map((column) => `"${column}" = NULL`).join(", ")} WHERE "id" = $1`, [credentialId]);
    for (const table of DELETE_ORDER) {
      const filter = kept[table];
      const where = filter ? filter.where.replace(" = $1", " <> $1") : "";
      // Delete the audit-bearing records themselves before users, including nullable actor references.
      // Do not invent replacement actors or rely on implicit ON DELETE SET NULL rewrites.
      const result = await client.query(`DELETE FROM ${qualified(table)}${where}`, filter?.values || []);
      assertSame(String(result.rowCount), report.find((row) => row.table === table).delete, `${table} deleted count`);
    }
    await checkTables();
    for (const row of report) {
      const { rows: [remaining] } = await client.query(`SELECT count(*)::text AS count FROM ${qualified(row.table)}`);
      assertSame(remaining.count, row.keep, `${row.table} final count`);
      if (kept[row.table]) {
        assertSame(await snapshot(row.table, kept[row.table]), snapshots[row.table], `${row.table} preserved fields`);
      }
      row.after = remaining.count;
    }
    const { rows: [account] } = await client.query(`SELECT * FROM "public"."Account" WHERE "id" = $1`, [credentialId]);
    if (!account || ACCOUNT_TOKENS.some((column) => account[column] !== null)) {
      throw new Error("Owner credential token revocation failed");
    }
    await client.query("COMMIT");
    inTransaction = false;
    console.table(report);
    console.log("Staging reset committed; preservation and empty-table checks passed inside the transaction. No fixtures, users, roles, locations, or passwords were created/replaced. Private disk files remain.");
  } catch (error) {
    if (inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch {
        console.error("Rollback could not be confirmed; keep staging stopped and inspect the database before retrying.");
      }
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  // Never print connection URLs, driver objects, row payloads, or password hashes.
  console.error(`Staging reset failed: ${error instanceof Error ? error.message : "unknown error"}`);
  console.error("No success is claimed. If the connection failed during COMMIT, inspect database state before retrying.");
  process.exitCode = 1;
});
