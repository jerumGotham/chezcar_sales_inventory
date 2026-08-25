import { describe, expect, it, vi } from "vitest";

import {
  DISPOSABLE_DATABASE_CONFIG,
  assertDisposableDatabaseUrl,
  withDisposableDatabase,
  type DatabaseCommandRunner,
  type DisposableDatabaseConfig,
} from "./database";

const validConfig = {
  ...DISPOSABLE_DATABASE_CONFIG,
  nodeEnv: "test",
} satisfies DisposableDatabaseConfig;

describe("assertDisposableDatabaseUrl", () => {
  it("accepts the dedicated local test target", () => {
    expect(
      assertDisposableDatabaseUrl(DISPOSABLE_DATABASE_CONFIG.databaseUrl, validConfig),
    ).toBe(DISPOSABLE_DATABASE_CONFIG.databaseUrl);
  });

  it.each([
    {
      name: "the checked-in development database",
      url: "postgresql://postgres:postgres@localhost:5435/chezcar_db?schema=public",
      config: validConfig,
    },
    {
      name: "production mode",
      url: DISPOSABLE_DATABASE_CONFIG.databaseUrl,
      config: { ...validConfig, nodeEnv: "production" },
    },
    {
      name: "a malformed URL",
      url: "not-a-postgresql-url",
      config: validConfig,
    },
    {
      name: "an arbitrary PostgreSQL target",
      url: "postgresql://postgres:postgres@example.com:5432/chezcar_test",
      config: validConfig,
    },
    {
      name: "an unmarked environment",
      url: DISPOSABLE_DATABASE_CONFIG.databaseUrl,
      config: { ...validConfig, marker: "unknown" },
    },
    {
      name: "an unknown container name",
      url: DISPOSABLE_DATABASE_CONFIG.databaseUrl,
      config: { ...validConfig, containerName: "postgres" },
    },
    {
      name: "an unexpected host port",
      url: DISPOSABLE_DATABASE_CONFIG.databaseUrl,
      config: { ...validConfig, port: 5432 },
    },
  ])("rejects $name", ({ url, config }) => {
    expect(() => assertDisposableDatabaseUrl(url, config)).toThrow(
      /disposable PostgreSQL target/i,
    );
  });
});

describe("withDisposableDatabase", () => {
  it("refuses an unsafe target before running any command", async () => {
    const runCommand = vi.fn<DatabaseCommandRunner>();

    await expect(
      withDisposableDatabase(
        async () => undefined,
        {
          config: {
            ...validConfig,
            databaseUrl:
              "postgresql://postgres:postgres@localhost:5435/chezcar_db?schema=public",
          },
          runCommand,
        },
      ),
    ).rejects.toThrow(/disposable PostgreSQL target/i);

    expect(runCommand).not.toHaveBeenCalled();
  });

  it("starts PostgreSQL 17, migrates serially, and removes only its named container", async () => {
    const commands: string[][] = [];
    const runCommand: DatabaseCommandRunner = async (command, args) => {
      commands.push([command, ...args]);
      return { stdout: "", stderr: "" };
    };

    await withDisposableDatabase(async ({ databaseUrl }) => {
      expect(databaseUrl).toBe(DISPOSABLE_DATABASE_CONFIG.databaseUrl);
    }, { config: validConfig, runCommand });

    expect(commands).toEqual([
      [
        "docker",
        "run",
        "--name",
        DISPOSABLE_DATABASE_CONFIG.containerName,
        "--rm",
        "--detach",
        "--publish",
        `${DISPOSABLE_DATABASE_CONFIG.port}:5432`,
        "--env",
        `POSTGRES_USER=${DISPOSABLE_DATABASE_CONFIG.user}`,
        "--env",
        `POSTGRES_PASSWORD=${DISPOSABLE_DATABASE_CONFIG.password}`,
        "--env",
        `POSTGRES_DB=${DISPOSABLE_DATABASE_CONFIG.databaseName}`,
        "postgres:17",
      ],
      [
        "docker",
        "exec",
        DISPOSABLE_DATABASE_CONFIG.containerName,
        "pg_isready",
        "--username",
        DISPOSABLE_DATABASE_CONFIG.user,
        "--dbname",
        DISPOSABLE_DATABASE_CONFIG.databaseName,
      ],
      ["npm", "exec", "--", "prisma", "migrate", "deploy"],
      ["docker", "rm", "--force", DISPOSABLE_DATABASE_CONFIG.containerName],
    ]);
    expect(commands.flat()).not.toContain("data/sales_inventory_postgres");
  });

  it("tears down the dedicated target when migration fails", async () => {
    const commands: string[][] = [];
    const runCommand: DatabaseCommandRunner = async (command, args) => {
      commands.push([command, ...args]);
      if (command === "npm") {
        throw new Error("migration failed");
      }
      return { stdout: "", stderr: "" };
    };

    await expect(
      withDisposableDatabase(async () => undefined, {
        config: validConfig,
        runCommand,
      }),
    ).rejects.toThrow("migration failed");

    expect(commands.at(-1)).toEqual([
      "docker",
      "rm",
      "--force",
      DISPOSABLE_DATABASE_CONFIG.containerName,
    ]);
  });
});
