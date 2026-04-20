import { mkdirSync } from "node:fs";
import path from "node:path";

import { ConsoleLogger } from "@mastra/core/logger";
import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { PostgresStore } from "@mastra/pg";

import { createFireSimAgent } from "./agents/firesim-agent";
import { simulateWorkflow } from "./workflows/simulate";

const DATABASE_URL_ENV_NAME = "DATABASE_URL";
const DEFAULT_LOCAL_DB_PATH = path.join("tmp", "mastra.db");
const MASTRA_STORAGE_ID = "firemapsim-mastra-storage";

let mastraSingleton: Mastra | null = null;
let mastraProxySingleton: Mastra | null = null;

type ResolveMastraStorageConfigOptions = {
  nodeEnv?: string;
  databaseUrl?: string;
  cwd?: string;
};

export type MastraStorageConfig =
  | {
      kind: "postgres";
      connectionString: string;
    }
  | {
      kind: "libsql";
      url: string;
    };

function normalizeDatabaseUrl(databaseUrl: string | undefined): string | undefined {
  const trimmed = databaseUrl?.trim();
  return trimmed ? trimmed : undefined;
}

export function isLocalMastraStorageUrl(storageUrl: string): boolean {
  const normalized = storageUrl.trim().toLowerCase();
  return normalized === ":memory:" || normalized.startsWith("file:");
}

export function isPostgresDatabaseUrl(databaseUrl: string): boolean {
  const normalized = databaseUrl.trim().toLowerCase();
  return (
    normalized.startsWith("postgres://") ||
    normalized.startsWith("postgresql://")
  );
}

export function resolveMastraStorageConfig(
  options: ResolveMastraStorageConfigOptions = {},
): MastraStorageConfig {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const databaseUrl = normalizeDatabaseUrl(
    options.databaseUrl ?? process.env.DATABASE_URL,
  );

  if (databaseUrl && !isPostgresDatabaseUrl(databaseUrl)) {
    throw new Error(
      `${DATABASE_URL_ENV_NAME} must be a PostgreSQL URL (postgres:// or postgresql://). Received "${databaseUrl}". Local file URLs are dev-only and rejected in production.`,
    );
  }

  if (nodeEnv === "production") {
    if (!databaseUrl) {
      throw new Error(
        `Missing ${DATABASE_URL_ENV_NAME} in production. Set it to your Supabase/Postgres connection string (for example, postgresql://...).`,
      );
    }

    return {
      kind: "postgres",
      connectionString: databaseUrl,
    };
  }

  if (databaseUrl) {
    return {
      kind: "postgres",
      connectionString: databaseUrl,
    };
  }

  const cwd = options.cwd ?? process.cwd();
  return {
    kind: "libsql",
    url: `file:${path.resolve(cwd, DEFAULT_LOCAL_DB_PATH)}`,
  };
}

function ensureLocalStorageDirectory(storageUrl: string): void {
  if (!storageUrl.toLowerCase().startsWith("file:")) {
    return;
  }

  const filePath = storageUrl.slice("file:".length);
  if (!filePath || filePath === ":memory:") {
    return;
  }

  const directory = path.dirname(filePath);
  if (!directory || directory === ".") {
    return;
  }

  mkdirSync(directory, { recursive: true });
}

export function getMastra(): Mastra {
  if (mastraSingleton) {
    return mastraSingleton;
  }

  const storageConfig = resolveMastraStorageConfig();

  mastraSingleton = new Mastra({
    agents: {
      fireSimAgent: createFireSimAgent(),
    },
    workflows: {
      simulateWorkflow,
    },
    storage: createMastraStorage(storageConfig),
    logger: new ConsoleLogger({
      name: "firemapsim-mastra",
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
    }),
  });

  return mastraSingleton;
}

export function createMastraStorage(
  storageConfig: MastraStorageConfig,
): LibSQLStore | PostgresStore {
  if (storageConfig.kind === "postgres") {
    return new PostgresStore({
      id: MASTRA_STORAGE_ID,
      connectionString: storageConfig.connectionString,
    });
  }

  if (isLocalMastraStorageUrl(storageConfig.url)) {
    ensureLocalStorageDirectory(storageConfig.url);
  }

  return new LibSQLStore({
    id: MASTRA_STORAGE_ID,
    url: storageConfig.url,
  });
}

function createMastraProxy(): Mastra {
  const proxyTarget = Object.create(Mastra.prototype) as Mastra;

  return new Proxy(proxyTarget, {
    get(_target, prop) {
      const instance = getMastra();
      const instanceRecord = instance as unknown as Record<PropertyKey, unknown>;
      const value = instanceRecord[prop];

      if (typeof value === "function") {
        return value.bind(instance);
      }

      return value;
    },
    set(_target, prop, value) {
      const instance = getMastra() as unknown as Record<PropertyKey, unknown>;
      instance[prop] = value;
      return true;
    },
    has(_target, prop) {
      return prop in (getMastra() as unknown as Record<PropertyKey, unknown>);
    },
    ownKeys() {
      return Reflect.ownKeys(getMastra() as unknown as Record<PropertyKey, unknown>);
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Object.getOwnPropertyDescriptor(
        getMastra() as unknown as Record<PropertyKey, unknown>,
        prop,
      );
    },
  });
}

function getMastraProxy(): Mastra {
  if (!mastraProxySingleton) {
    mastraProxySingleton = createMastraProxy();
  }
  return mastraProxySingleton;
}

// Mastra CLI/deployer expects a named `mastra` export from this module.
// This proxy preserves that contract while keeping initialization lazy.
export const mastra = getMastraProxy();
