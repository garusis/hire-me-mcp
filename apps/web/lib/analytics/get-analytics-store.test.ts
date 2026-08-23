import type { DbClient } from "@hire-me-mcp/core/db";
import * as db from "@hire-me-mcp/core/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@hire-me-mcp/core/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core/db")>();
  return { ...actual, createDbClient: vi.fn(), loadDbConfig: vi.fn() };
});

function fakeDbClient(): DbClient {
  return { sql: {} as DbClient["sql"], close: vi.fn().mockResolvedValue(undefined) };
}

describe("getAnalyticsStore", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(db.loadDbConfig).mockReset();
    vi.mocked(db.createDbClient).mockReset();
  });

  afterEach(async () => {
    const { resetAnalyticsStoreForTests } = await import("./get-analytics-store.js");
    await resetAnalyticsStoreForTests();
  });

  it("builds and memoizes an AnalyticsStore backed by the configured Postgres client", async () => {
    vi.mocked(db.loadDbConfig).mockReturnValue({ connectionString: "postgres://fixture/db" });
    vi.mocked(db.createDbClient).mockReturnValue(fakeDbClient());
    const { getAnalyticsStore } = await import("./get-analytics-store.js");

    const first = getAnalyticsStore();
    const second = getAnalyticsStore();

    expect(first).toBeDefined();
    expect(second).toBe(first);
    expect(db.createDbClient).toHaveBeenCalledTimes(1);
  });

  it("returns undefined without throwing when DATABASE_URL is not configured", async () => {
    vi.mocked(db.loadDbConfig).mockImplementation(() => {
      throw new db.MissingDatabaseUrlError();
    });
    const { getAnalyticsStore } = await import("./get-analytics-store.js");

    expect(() => getAnalyticsStore()).not.toThrow();
    expect(getAnalyticsStore()).toBeUndefined();
  });

  it("does not retry construction on every call once it has failed once", async () => {
    vi.mocked(db.loadDbConfig).mockImplementation(() => {
      throw new db.MissingDatabaseUrlError();
    });
    const { getAnalyticsStore } = await import("./get-analytics-store.js");

    getAnalyticsStore();
    getAnalyticsStore();

    expect(db.loadDbConfig).toHaveBeenCalledTimes(1);
  });
});
