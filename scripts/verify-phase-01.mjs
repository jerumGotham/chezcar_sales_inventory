#!/usr/bin/env node
/**
 * Phase 1 evidence gate.
 *
 * Positively asserts the disposable PostgreSQL test target plus the required
 * seed/reset environment, then executes and records:
 *   - fresh `prisma migrate deploy`
 *   - `db:seed`
 *   - two `db:catalog:reload` runs with canonical row/hash equivalence proof
 *   - full unit suite, full serial integration suite, typecheck, build
 *   - lint separately, capturing the expected existing failure baseline
 *
 * Results are written to docs/verification/phase-01-evidence.md. Secrets and
 * connection URLs are never written to the report. Completed manual UAT rows
 * (status pass/fail) are preserved across reruns; everything else refreshes.
 *
 * `--validate-evidence` re-reads the committed report and fails when any
 * automated result, the lint-baseline capture, an edge-rule mapping, or a
 * manual UAT status is absent.
 */

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE_PATH = join(ROOT, "docs", "verification", "phase-01-evidence.md");

const DISPOSABLE_URL =
  "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
const TARGET_IDENTITY = "disposable PostgreSQL 17 test identity localhost:55435/chezcar_test_01_13 (credentials redacted)";
const CONTAINER = "chezcar_test_postgres_01_13";
const EXPECTED_COUNTS = { locations: 6, products: 1432, openingBalances: 8592 };

const EDGE_RULES = [
  {
    id: "D-05",
    rule:
      "The developer may reset and reload seeded catalog/opening inventory at any time in development or test. Production reset-and-reload must be blocked.",
    evidence:
      "`lib/server/services/catalog-reset.test.ts` (positive gates, production/unknown/bind-mount refusal); `tests/integration/migration.test.ts` + `tests/integration/seed.test.ts`; this gate's own MIGRATE_DEPLOY, SEED, CATALOG_RELOAD_1, and CATALOG_RELOAD_2 steps executed on the disposable target only",
  },
  {
    id: "D-06",
    rule:
      "Suspected duplicate items are flagged for owner review. Do not merge them automatically.",
    evidence:
      "`scripts/data-onboarding/canonicalize.test.ts` #buildReviewFindings \"blocks every duplicate code collision and conflicting price without choosing a winner\" and \"blocks suspected duplicate names under different codes\"; all suspected-duplicate groups remain separate in `scripts/data-onboarding/resolutions.json`; the approved fixture rejects duplicate item codes (`prisma/seed.mjs` validation)",
  },
  {
    id: "D-07",
    rule:
      "Rows without item codes receive generated temporary codes. The exact temporary-code format is left to the planner.",
    evidence:
      "`scripts/data-onboarding/canonicalize.test.ts` #classifySourceRow \"creates a deterministic temporary code only for a classified product\"; TMP-R* codes appear in the committed traceability outputs and the generated fixture retains them as itemCode values",
  },
  {
    id: "D-08",
    rule:
      "A row with a negative, blank, or non-numeric quantity is blocked until reviewed and confirmed; do not silently coerce it to zero.",
    evidence:
      "`scripts/data-onboarding/canonicalize.d.mts` finding kinds INVALID_QUANTITY_NEGATIVE/BLANK/NONNUMERIC; `scripts/data-onboarding/canonicalize.test.ts` #buildReviewFindings blocks without coercion; one-to-one owner resolutions exist for every quantity finding (`canonicalize.test.ts` #approved owner resolution coverage); fixture balances are validated non-negative integers before seeding",
  },
  {
    id: "D-09",
    rule:
      "Conflicting prices for the same item require explicit owner confirmation; no last-row or highest-price rule applies automatically.",
    evidence:
      "`scripts/data-onboarding/canonicalize.test.ts` #buildReviewFindings \"blocks every duplicate code collision and conflicting price without choosing a winner\"; CONFLICTING_PRICE findings carry raw/formula/cache evidence and require explicit resolutions in `scripts/data-onboarding/resolutions.json` before candidates are emitted",
  },
  {
    id: "D-16/D-17",
    rule:
      "Deactivating an account immediately revokes its active sessions. Changing an active user's role or assigned branch immediately revokes active sessions; the user must sign in again to receive the new access and branch context.",
    evidence:
      "`tests/integration/session-revocation.test.ts` (atomic deletion of every target session, forced-failure rollback, concurrency serialization, data-free 403 after re-authentication); `tests/integration/user-management.test.ts` lifecycle semantics; `lib/server/services/users.ts` single-transaction FOR UPDATE access writes",
  },
];

const UAT_ROWS = [
  ["UAT-01", "01-08", "No forbidden-link flash and preserved desktop/mobile sidebar behavior for all four roles"],
  ["UAT-02", "01-08", "AppHeader scope feedback correct for Admin, Stock Staff, Branch Staff, Accounting on permitted pages at 320px/desktop and light/dark"],
  ["UAT-03", "01-15", "Direct forbidden navigation shows only the approved denial copy inside the permitted shell with Back to Dashboard"],
  ["UAT-04", "01-15", "Missing/expired/inactive/revoked page sessions go to sign-in with a safe local callback"],
  ["UAT-05", "01-16", "Admin location selector enabled; Stock/Branch controls read-only to SR/branch; Accounting denied Inventory while header stays Business-wide"],
  ["UAT-06", "01-10", "First-login prompt covers blank/loading/error/change/skip/later-reset at 320px/desktop, keyboard-only, reduced motion, light/dark"],
  ["UAT-07", "01-11", "/users first-load, updating retention, both empty states, load error/retry, one/many result copy, pagination, long names/emails/errors, light/dark"],
  ["UAT-08", "01-11", "Create/edit/reset/deactivate/reactivate success/failure dialogs: keyboard/focus/Escape, immutable Owner row, no Admin creation path"],
  ["UAT-09", "01-09/01-10", "Old-cookie revocation observed in browser after deactivation or role/branch change; sign-in yields the new access context"],
  ["UAT-10", "T-01-08", "Temporary passwords never appear in UI text, URLs, logs, or banners; success copy directs offline sharing"],
  ["UAT-11", "01-08/01-11/01-16", "Responsive/theme regression walk across shell, users page, inventory page at 320px and desktop in light/dark"],
  ["UAT-12", "01-12", "Workbook/catalog developer tooling exposes no HTTP or UI surface (no upload/import entries anywhere in the app)"],
];

function printError(message) {
  console.error(`verify-phase-01: ${message}`);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd: ROOT,
      env: options.env ?? process.env,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      resolve({ code: -1, stdout, stderr: `${stderr}\n${error.message}`, durationMs: Date.now() - startedAt });
    });
    child.once("close", (code) => {
      resolve({ code, stdout, stderr, durationMs: Date.now() - startedAt });
    });
  });
}

function redact(text) {
  return text
    .replaceAll("postgres:postgres@", "<redacted>@")
    .replace(/postgresql:\/\/\S+/g, "<redacted-url>");
}

function tail(text, lines = 25) {
  const normalized = redact(text ?? "").trimEnd();
  if (!normalized) return "_no output_";
  const all = normalized.split(/\r?\n/);
  const selected = all.slice(Math.max(0, all.length - lines));
  return ["```text", ...selected, "```"].join("\n");
}

async function assertEnvironment() {
  const problems = [];
  if (process.env.DATABASE_URL !== DISPOSABLE_URL) {
    problems.push("DATABASE_URL must exactly identify the disposable test target");
  }
  if (process.env.NODE_ENV !== "test") {
    problems.push("NODE_ENV must be 'test' for the disposable target");
  }
  if (process.env.ALLOW_CATALOG_RESET !== "true") {
    problems.push("ALLOW_CATALOG_RESET must be 'true'");
  }
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim();
  if (!email || !password || !name) {
    problems.push("Non-example SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, and SEED_ADMIN_NAME are required");
  } else {
    if (email.endsWith(".invalid")) problems.push("SEED_ADMIN_EMAIL must not be an example value");
    if (password.startsWith("replace-with") || password.length < 12) {
      problems.push("SEED_ADMIN_PASSWORD must be a non-example value of at least 12 characters");
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `Environment gate failed (values are intentionally not echoed):\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    );
  }
}

async function dockerReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = await runCommand("docker", [
      "exec", CONTAINER, "pg_isready", "--username", "postgres", "--dbname", "chezcar_test_01_13",
    ]);
    if (probe.code === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Disposable PostgreSQL 17 did not become ready");
}

async function provisionDisposableDatabase(steps) {
  const existing = await runCommand("docker", ["ps", "-a", "--filter", `name=${CONTAINER}`, "--format", "{{.Names}}"]);
  if (existing.code === 0 && existing.stdout.includes(CONTAINER)) {
    throw new Error(
      `Container ${CONTAINER} already exists; remove it before running the gate so the disposable lifecycle starts clean`,
    );
  }
  const run = await runCommand("docker", [
    "run", "--name", CONTAINER, "--rm", "--detach",
    "--publish", "55435:5432",
    "--env", "POSTGRES_USER=postgres",
    "--env", "POSTGRES_PASSWORD=postgres",
    "--env", "POSTGRES_DB=chezcar_test_01_13",
    "postgres:17",
  ]);
  if (run.code !== 0) throw new Error(`Failed to start ${CONTAINER}: ${run.stderr.trim()}`);
  steps.push({
    id: "PROVISION_DISPOSABLE_TARGET",
    command: `docker run --name ${CONTAINER} (detached, no bind mount, postgres:17)`,
    code: 0,
    durationMs: run.durationMs,
    output: "Container ready after the pg_isready wait loop",
  });
  await dockerReady();
}

async function teardownDisposableDatabase(steps) {
  const rm = await runCommand("docker", ["rm", "--force", CONTAINER]);
  steps.push({
    id: "TEARDOWN_DISPOSABLE_TARGET",
    command: `docker rm --force ${CONTAINER}`,
    code: rm.code,
    durationMs: rm.durationMs,
    output: rm.code === 0 ? "Container removed before the integration project boots its own instance" : tail(rm.stderr),
  });
  if (rm.code !== 0) throw new Error("Failed to remove the disposable container");
}

const DB_ENV = () => ({
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: DISPOSABLE_URL,
  ALLOW_CATALOG_RESET: "true",
});
const TOOL_ENV = () => {
  const { NODE_ENV, ...rest } = process.env;
  return rest;
};

async function runStep(steps, id, command, args, env) {
  const result = await runCommand(command, args, { env });
  steps.push({
    id,
    command: [command, ...args].join(" "),
    code: result.code,
    durationMs: result.durationMs,
    output: tail(`${result.stdout}\n${result.stderr}`),
  });
  return result;
}

async function canonicalSnapshot() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: DISPOSABLE_URL });
  try {
    const locations = await prisma.location.findMany({
      select: { code: true, name: true, type: true, isActive: true },
      orderBy: { code: "asc" },
    });
    const products = await prisma.product.findMany({
      select: { itemCode: true, name: true, price: true, status: true },
      orderBy: { itemCode: "asc" },
    });
    const balances = await prisma.inventoryBalance.findMany({
      select: { onHand: true, product: { select: { itemCode: true } }, location: { select: { code: true } } },
      orderBy: [{ product: { itemCode: "asc" } }, { location: { code: "asc" } }],
    });
    const canonical = JSON.stringify({
      locations,
      products,
      balances: balances.map((balance) => [balance.product.itemCode, balance.location.code, balance.onHand]),
    });
    return {
      counts: {
        locations: locations.length,
        products: products.length,
        openingBalances: balances.length,
      },
      hash: createHash("sha256").update(canonical).digest("hex"),
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function readExistingManualStatuses() {
  try {
    const contents = await readFile(EVIDENCE_PATH, "utf8");
    const statuses = {};
    for (const match of contents.matchAll(/^\| (UAT-\d+) \|.*\| (pass|fail) \|([^\n]*)$/gim)) {
      statuses[match[1]] = { status: match[2].toLowerCase(), notes: match[3].trim().replaceAll("\\|", "|") };
    }
    return statuses;
  } catch {
    return {};
  }
}

function renderEvidence({ generatedAt, nodeVersion, steps, snapshots, lintBaseline, manualStatuses }) {
  const lines = [];
  lines.push("# Phase 1 Verification Evidence");
  lines.push("");
  lines.push("Generated by `scripts/verify-phase-01.mjs`. Secrets, passwords, and connection URLs are never recorded here.");
  lines.push("");
  lines.push(`- Generated at: ${generatedAt}`);
  lines.push(`- Node: \`${nodeVersion}\``);
  lines.push(`- Target: ${TARGET_IDENTITY}`);
  lines.push("- Seed admin: non-example environment-supplied owner Admin credentials (values redacted)");
  lines.push("");
  lines.push("## Automated results");
  lines.push("");
  lines.push("| Step | Command | Exit | Result | Duration | Notes |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const step of steps) {
    const result = step.id === "LINT_BASELINE"
      ? (step.code === 0 ? "PASS (baseline changed: lint now exits zero)" : "BASELINE CAPTURED (expected existing failure)")
      : (step.code === 0 ? "PASS" : "FAIL");
    lines.push(`| ${step.id} | \`${step.command}\` | ${step.code} | ${result} | ${(step.durationMs / 1000).toFixed(1)}s | ${step.notes ?? ""} |`);
  }
  lines.push("");
  lines.push("## Catalog reload equivalence");
  lines.push("");
  lines.push(`- Reload 1 counts: ${JSON.stringify(snapshots.first.counts)}; SHA-256 \`${snapshots.first.hash.slice(0, 16)}…\``);
  lines.push(`- Reload 2 counts: ${JSON.stringify(snapshots.second.counts)}; SHA-256 \`${snapshots.second.hash.slice(0, 16)}…\``);
  lines.push(`- Expected counts: ${JSON.stringify(EXPECTED_COUNTS)}`);
  lines.push(`- Equivalence: ${snapshots.equal && snapshots.expectedCounts ? "IDENTICAL row content and counts across both reloads" : "NOT EQUIVALENT"}`);
  lines.push("");
  lines.push("## Lint baseline");
  lines.push("");
  lines.push(lintBaseline.summary ||
    "The checked-in ESLint configuration currently reports pre-existing prototype debt; the gate captures this separately and never treats it as passing.");
  lines.push("");
  lines.push("## Locked edge-rule evidence mapping");
  lines.push("");
  lines.push("| Rule | Requirement (verbatim) | Evidence |");
  lines.push("| --- | --- | --- |");
  for (const edge of EDGE_RULES) {
    lines.push(`| ${edge.id} | ${edge.rule} | ${edge.evidence} |`);
  }
  lines.push("");
  lines.push("## Manual UAT queue");
  lines.push("");
  lines.push("`pending` is never treated as passed. Rows marked pass/fail were human-observed and are preserved across reruns.");
  lines.push("");
  lines.push("| ID | Source plan | Check | Status | Notes |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const [id, source, check] of UAT_ROWS) {
    const preserved = manualStatuses[id];
    const status = preserved?.status ?? "pending";
    const notes = (preserved?.notes ?? "").replaceAll("|", "\\|");
    lines.push(`| ${id} | ${source} | ${check} | ${status} | ${notes} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function writeEvidence(contents) {
  await mkdir(dirname(EVIDENCE_PATH), { recursive: true });
  await writeFile(EVIDENCE_PATH, contents, "utf8");
}

async function executeGate() {
  const generatedAt = new Date().toISOString();
  const nodeVersion = process.version;

  await assertEnvironment();

  const steps = [];
  const failures = [];

  await provisionDisposableDatabase(steps);

  const migrate = await runStep(steps, "MIGRATE_DEPLOY", "npm", ["exec", "--", "prisma", "migrate", "deploy"], DB_ENV());
  if (migrate.code !== 0) failures.push("MIGRATE_DEPLOY failed");

  const seed = await runStep(steps, "SEED", "npm", ["run", "db:seed"], DB_ENV());
  if (seed.code !== 0) failures.push("SEED failed");

  const reload1 = await runStep(steps, "CATALOG_RELOAD_1", "npm", ["run", "db:catalog:reload"], DB_ENV());
  if (reload1.code !== 0) failures.push("CATALOG_RELOAD_1 failed");
  const first = await canonicalSnapshot();
  steps[steps.length - 1] = { ...steps.at(-1), notes: "snapshot captured" };

  const reload2 = await runStep(steps, "CATALOG_RELOAD_2", "npm", ["run", "db:catalog:reload"], DB_ENV());
  if (reload2.code !== 0) failures.push("CATALOG_RELOAD_2 failed");
  const second = await canonicalSnapshot();

  const snapshots = {
    first,
    second,
    equal: first.hash === second.hash && JSON.stringify(first.counts) === JSON.stringify(second.counts),
    expectedCounts:
      first.counts.locations === EXPECTED_COUNTS.locations &&
      first.counts.products === EXPECTED_COUNTS.products &&
      first.counts.openingBalances === EXPECTED_COUNTS.openingBalances,
  };
  if (!snapshots.equal || !snapshots.expectedCounts) failures.push("Catalog reload equivalence failed");

  await teardownDisposableDatabase(steps);

  const automated = [
    ["UNIT_TESTS", "npm", ["run", "test"], TOOL_ENV()],
    ["INTEGRATION_TESTS", "npm", ["run", "test:integration"], TOOL_ENV()],
    ["TYPECHECK", "npm", ["run", "typecheck"], TOOL_ENV()],
    ["BUILD", "npm", ["run", "build"], TOOL_ENV()],
  ];
  for (const [id, command, args, env] of automated) {
    const result = await runStep(steps, id, command, args, env);
    if (result.code !== 0) failures.push(`${id} failed`);
  }

  // Lint runs separately: its known pre-existing failure baseline is captured
  // without failing the phase. Any OTHER failure above still fails the gate.
  const lint = await runStep(steps, "LINT_BASELINE", "npm", ["run", "lint"], TOOL_ENV());
  const lintOutput = `${lint.stdout}\n${lint.stderr}`;
  const problemsMatch = lintOutput.match(/✖\s*(\d+)\s*problems?\s*\((\d+)\s*errors?,\s*(\d+)\s*warnings?\)/);
  const lintBaseline = {
    summary: problemsMatch
      ? `Expected existing failure baseline captured: ${problemsMatch[2]} errors and ${problemsMatch[3]} warnings (exit ${lint.code}). This debt is tracked and does not pass or fail the phase.`
      : `Expected existing lint failure baseline captured (exit ${lint.code}); problem counts were not parsed from output.`,
  };
  steps[steps.length - 1] = { ...steps.at(-1), notes: lintBaseline.summary };

  const manualStatuses = await readExistingManualStatuses();
  await writeEvidence(renderEvidence({ generatedAt, nodeVersion, steps, snapshots, lintBaseline, manualStatuses }));

  if (failures.length > 0) {
    printError(`Gate FAILED: ${failures.join("; ")}. Evidence written to ${EVIDENCE_PATH}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Gate PASSED. Evidence written to ${EVIDENCE_PATH}`);
}

async function validateEvidence() {
  let contents;
  try {
    contents = await readFile(EVIDENCE_PATH, "utf8");
  } catch {
    printError(`Evidence file missing at ${EVIDENCE_PATH}; run the gate first`);
    process.exitCode = 1;
    return;
  }

  const problems = [];
  const requiredSteps = [
    "PROVISION_DISPOSABLE_TARGET", "MIGRATE_DEPLOY", "SEED", "CATALOG_RELOAD_1", "CATALOG_RELOAD_2",
    "TEARDOWN_DISPOSABLE_TARGET", "UNIT_TESTS", "INTEGRATION_TESTS", "TYPECHECK", "BUILD", "LINT_BASELINE",
  ];
  for (const id of requiredSteps) {
    if (!contents.includes(`| ${id} |`)) problems.push(`automated result row missing: ${id}`);
  }
  if (!/Equivalence: IDENTICAL/.test(contents)) problems.push("catalog reload equivalence proof absent");
  if (!/Lint baseline/i.test(contents)) problems.push("lint-baseline capture absent");
  for (const edge of EDGE_RULES) {
    if (!new RegExp(`^\\| ${edge.id.replace(/[/.]/g, "\\$&")} \\|`, "m").test(contents)) {
      problems.push(`edge-rule mapping missing: ${edge.id}`);
    }
  }
  for (const [id] of UAT_ROWS) {
    const rowMatch = contents.match(new RegExp(`^\\| ${id} \\|[^\\n]*$`, "m"));
    if (!rowMatch) {
      problems.push(`manual UAT row missing: ${id}`);
    } else if (!/\| (pending|pass|fail) \|/i.test(rowMatch[0])) {
      problems.push(`manual UAT row has no pending/pass/fail status: ${id}`);
    }
  }

  if (problems.length > 0) {
    printError(`Evidence validation FAILED:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exitCode = 1;
    return;
  }
  console.log("Evidence validation PASSED.");
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const mode = process.argv[2];
  const run = mode === "--validate-evidence" ? validateEvidence : executeGate;
  run().catch((error) => {
    printError(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
