import { spawn } from "node:child_process";

import { PrismaClient } from "@prisma/client";

const DISPOSABLE_MARKER = "chezcar-integration-disposable-v1";
const DISPOSABLE_CONTAINER = "chezcar_test_postgres_01_13";
const DISPOSABLE_DATABASE = "chezcar_test_01_13";
const DISPOSABLE_PORT = 55435;
const DISPOSABLE_USER = "postgres";
const DISPOSABLE_PASSWORD = "postgres";

export type DisposableDatabaseConfig = {
  databaseUrl: string;
  marker: string;
  containerName: string;
  databaseName: string;
  port: number;
  user: string;
  password: string;
  nodeEnv: string | undefined;
};

export const DISPOSABLE_DATABASE_CONFIG = Object.freeze({
  databaseUrl: `postgresql://${DISPOSABLE_USER}:${DISPOSABLE_PASSWORD}@localhost:${DISPOSABLE_PORT}/${DISPOSABLE_DATABASE}?schema=public`,
  marker: DISPOSABLE_MARKER,
  containerName: DISPOSABLE_CONTAINER,
  databaseName: DISPOSABLE_DATABASE,
  port: DISPOSABLE_PORT,
  user: DISPOSABLE_USER,
  password: DISPOSABLE_PASSWORD,
  nodeEnv: "test",
}) satisfies Readonly<DisposableDatabaseConfig>;

export type DatabaseCommandResult = {
  stdout: string;
  stderr: string;
};

export type DatabaseCommandRunner = (
  command: string,
  args: readonly string[],
  options?: { env?: NodeJS.ProcessEnv },
) => Promise<DatabaseCommandResult>;

export type DisposableDatabaseContext = {
  databaseUrl: string;
  prisma: PrismaClient;
};

type DisposableDatabaseOptions = {
  config?: DisposableDatabaseConfig;
  runCommand?: DatabaseCommandRunner;
};

function unsafeTarget(): never {
  throw new Error(
    "Refusing to use a PostgreSQL target that is not the dedicated disposable PostgreSQL target",
  );
}

export function assertDisposableDatabaseUrl(
  databaseUrl: string,
  config: DisposableDatabaseConfig = {
    ...DISPOSABLE_DATABASE_CONFIG,
    nodeEnv: process.env.NODE_ENV,
  },
): string {
  if (
    config.nodeEnv !== "test" ||
    config.marker !== DISPOSABLE_MARKER ||
    config.containerName !== DISPOSABLE_CONTAINER ||
    config.databaseName !== DISPOSABLE_DATABASE ||
    config.port !== DISPOSABLE_PORT ||
    config.user !== DISPOSABLE_USER ||
    config.password !== DISPOSABLE_PASSWORD ||
    config.databaseUrl !== databaseUrl
  ) {
    return unsafeTarget();
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return unsafeTarget();
  }

  if (
    parsed.protocol !== "postgresql:" ||
    parsed.hostname !== "localhost" ||
    parsed.port !== String(DISPOSABLE_PORT) ||
    decodeURIComponent(parsed.pathname.slice(1)) !== DISPOSABLE_DATABASE ||
    decodeURIComponent(parsed.username) !== DISPOSABLE_USER ||
    decodeURIComponent(parsed.password) !== DISPOSABLE_PASSWORD ||
    parsed.searchParams.size !== 1 ||
    parsed.searchParams.get("schema") !== "public"
  ) {
    return unsafeTarget();
  }

  return databaseUrl;
}

const defaultRunCommand: DatabaseCommandRunner = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      env: options.env ?? process.env,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} exited with code ${code}: ${stderr.trim()}`,
        ),
      );
    });
  });

function pause(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForPostgres(
  config: DisposableDatabaseConfig,
  runCommand: DatabaseCommandRunner,
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await runCommand("docker", [
        "exec",
        config.containerName,
        "pg_isready",
        "--username",
        config.user,
        "--dbname",
        config.databaseName,
      ]);
      return;
    } catch (error) {
      lastError = error;
      await pause(250);
    }
  }

  throw new Error("Disposable PostgreSQL 17 did not become ready", {
    cause: lastError,
  });
}

export async function withDisposableDatabase<T>(
  callback: (context: DisposableDatabaseContext) => Promise<T>,
  options: DisposableDatabaseOptions = {},
): Promise<T> {
  const config = options.config ?? {
    ...DISPOSABLE_DATABASE_CONFIG,
    nodeEnv: process.env.NODE_ENV,
  };
  const runCommand = options.runCommand ?? defaultRunCommand;
  const databaseUrl = assertDisposableDatabaseUrl(config.databaseUrl, config);
  let started = false;
  let prisma: PrismaClient | undefined;

  try {
    await runCommand("docker", [
      "run",
      "--name",
      config.containerName,
      "--rm",
      "--detach",
      "--publish",
      `${config.port}:5432`,
      "--env",
      `POSTGRES_USER=${config.user}`,
      "--env",
      `POSTGRES_PASSWORD=${config.password}`,
      "--env",
      `POSTGRES_DB=${config.databaseName}`,
      "postgres:17",
    ]);
    started = true;

    await waitForPostgres(config, runCommand);
    await runCommand(
      "npm",
      ["exec", "--", "prisma", "migrate", "deploy"],
      { env: { ...process.env, DATABASE_URL: databaseUrl } },
    );

    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    return await callback({ databaseUrl, prisma });
  } finally {
    await prisma?.$disconnect();
    if (started) {
      await runCommand("docker", ["rm", "--force", config.containerName]);
    }
  }
}
