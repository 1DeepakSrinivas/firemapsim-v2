import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { LibSQLStore } from "@mastra/libsql";
import { PostgresStore } from "@mastra/pg";
import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

async function loadMastraModule() {
  return import("@/mastra");
}

describe("resolveMastraStorageConfig", () => {
  test("throws when DATABASE_URL is missing in production", async () => {
    const { resolveMastraStorageConfig } = await loadMastraModule();

    expect(() =>
      resolveMastraStorageConfig({
        nodeEnv: "production",
        databaseUrl: "",
      }),
    ).toThrow(/Missing DATABASE_URL/);
  });

  test("throws when a file URL is used for DATABASE_URL in production", async () => {
    const { resolveMastraStorageConfig } = await loadMastraModule();

    expect(() =>
      resolveMastraStorageConfig({
        nodeEnv: "production",
        databaseUrl: "file:/tmp/mastra.db",
      }),
    ).toThrow(/must be a PostgreSQL URL/);
  });

  test("throws when a libsql URL is used for DATABASE_URL in production", async () => {
    const { resolveMastraStorageConfig } = await loadMastraModule();

    expect(() =>
      resolveMastraStorageConfig({
        nodeEnv: "production",
        databaseUrl: "libsql://example.turso.io",
      }),
    ).toThrow(/must be a PostgreSQL URL/);
  });

  test("defaults to absolute tmp/mastra.db in non-production", async () => {
    const { resolveMastraStorageConfig } = await loadMastraModule();
    const cwd = path.join(path.sep, "tmp", "firemapsim-v2-tests");

    const storageConfig = resolveMastraStorageConfig({
      nodeEnv: "development",
      databaseUrl: "",
      cwd,
    });

    expect(storageConfig).toEqual({
      kind: "libsql",
      url: `file:${path.resolve(cwd, "tmp", "mastra.db")}`,
    });
  });

  test("uses postgres config in non-production when DATABASE_URL is set", async () => {
    const { resolveMastraStorageConfig } = await loadMastraModule();
    const databaseUrl = "postgresql://postgres:postgres@localhost:5432/firemapsim";

    const storageConfig = resolveMastraStorageConfig({
      nodeEnv: "development",
      databaseUrl,
    });

    expect(storageConfig).toEqual({
      kind: "postgres",
      connectionString: databaseUrl,
    });
  });
});

describe("createMastraStorage", () => {
  test("constructs a PostgresStore for postgres config", async () => {
    const { createMastraStorage } = await loadMastraModule();
    const storage = createMastraStorage({
      kind: "postgres",
      connectionString: "postgresql://postgres:postgres@localhost:5432/firemapsim",
    });

    expect(storage).toBeInstanceOf(PostgresStore);
  });

  test("constructs a LibSQLStore for libsql config and ensures file directory exists", async () => {
    const { createMastraStorage } = await loadMastraModule();
    const tempRoot = mkdtempSync(path.join(tmpdir(), "mastra-storage-test-"));
    const nestedDir = path.join(tempRoot, "nested", "tmp");
    const sqlitePath = path.join(nestedDir, "mastra.db");

    const storage = createMastraStorage({
      kind: "libsql",
      url: `file:${sqlitePath}`,
    });

    expect(storage).toBeInstanceOf(LibSQLStore);
    expect(existsSync(nestedDir)).toBe(true);

    rmSync(tempRoot, { recursive: true, force: true });
  });
});
