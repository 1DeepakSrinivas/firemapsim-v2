import { ConsoleLogger } from "@mastra/core/logger";
import { Mastra } from "@mastra/core/mastra";

import { createFireSimAgent } from "./agents/firesim-agent";
import { simulateWorkflow } from "./workflows/simulate";

let mastraSingleton: Mastra | null = null;
let mastraProxySingleton: Mastra | null = null;

export function getMastra(): Mastra {
  if (mastraSingleton) {
    return mastraSingleton;
  }

  mastraSingleton = new Mastra({
    agents: {
      fireSimAgent: createFireSimAgent(),
    },
    workflows: {
      simulateWorkflow,
    },
    logger: new ConsoleLogger({
      name: "firemapsim-mastra",
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
    }),
  });

  return mastraSingleton;
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
