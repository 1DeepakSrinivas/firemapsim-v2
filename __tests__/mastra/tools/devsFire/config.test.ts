import { describe, expect, test } from "bun:test";

import {
  DEFAULT_DEVS_FIRE_REQUEST_TIMEOUT_MS,
  parseTimeoutMs,
} from "@/mastra/tools/devsFire/config";

describe("parseTimeoutMs", () => {
  test("uses the new DEVS-FIRE timeout default", () => {
    expect(DEFAULT_DEVS_FIRE_REQUEST_TIMEOUT_MS).toBe(180_000);
    expect(parseTimeoutMs(undefined, DEFAULT_DEVS_FIRE_REQUEST_TIMEOUT_MS)).toBe(
      180_000,
    );
  });

  test("accepts valid positive numeric values", () => {
    expect(parseTimeoutMs("240000", DEFAULT_DEVS_FIRE_REQUEST_TIMEOUT_MS)).toBe(
      240_000,
    );
    expect(parseTimeoutMs("1234.9", DEFAULT_DEVS_FIRE_REQUEST_TIMEOUT_MS)).toBe(
      1234,
    );
  });

  test("falls back for invalid or non-positive values", () => {
    expect(parseTimeoutMs("0", DEFAULT_DEVS_FIRE_REQUEST_TIMEOUT_MS)).toBe(
      DEFAULT_DEVS_FIRE_REQUEST_TIMEOUT_MS,
    );
    expect(parseTimeoutMs("-1", DEFAULT_DEVS_FIRE_REQUEST_TIMEOUT_MS)).toBe(
      DEFAULT_DEVS_FIRE_REQUEST_TIMEOUT_MS,
    );
    expect(parseTimeoutMs("abc", DEFAULT_DEVS_FIRE_REQUEST_TIMEOUT_MS)).toBe(
      DEFAULT_DEVS_FIRE_REQUEST_TIMEOUT_MS,
    );
  });
});
