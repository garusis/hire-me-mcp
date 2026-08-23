import type { DbClient } from "@hire-me-mcp/core/db";
import * as db from "@hire-me-mcp/core/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRetentionCronHandler } from "./handler";

vi.mock("@hire-me-mcp/core/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core/db")>();
  return { ...actual, createDbClient: vi.fn(), loadDbConfig: vi.fn() };
});

function fakeSql() {
  const calls: string[] = [];
  function tag(strings: TemplateStringsArray): Promise<unknown[]> {
    calls.push(strings.join("?"));
    return Promise.resolve(Object.assign([], { count: 2 }));
  }
  return { sql: tag as unknown as DbClient["sql"], calls };
}

function fakeDbClient(): { client: DbClient; close: ReturnType<typeof vi.fn> } {
  const { sql } = fakeSql();
  const close = vi.fn().mockResolvedValue(undefined);
  return { client: { sql, close }, close };
}

function makeRequest(authorization?: string): Request {
  return new Request("https://example.com/api/cron/analytics-retention", {
    headers: authorization ? { authorization } : {},
  });
}

describe("createRetentionCronHandler", () => {
  afterEach(() => {
    vi.mocked(db.loadDbConfig).mockReset();
    vi.mocked(db.createDbClient).mockReset();
  });

  it("returns 401 without calling the database when a configured cron secret doesn't match", async () => {
    const { client } = fakeDbClient();
    vi.mocked(db.loadDbConfig).mockReturnValue({ connectionString: "postgres://fixture" });
    vi.mocked(db.createDbClient).mockReturnValue(client);
    const GET = createRetentionCronHandler({ cronSecret: "top-secret" });

    const response = await GET(makeRequest("Bearer wrong"));

    expect(response.status).toBe(401);
    expect(db.createDbClient).not.toHaveBeenCalled();
  });

  it("returns 401 when no Authorization header is sent and a secret is configured", async () => {
    const GET = createRetentionCronHandler({ cronSecret: "top-secret" });

    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
  });

  it("runs the retention job and returns 200 with deletion counts when authorized", async () => {
    const { client, close } = fakeDbClient();
    vi.mocked(db.loadDbConfig).mockReturnValue({ connectionString: "postgres://fixture" });
    vi.mocked(db.createDbClient).mockReturnValue(client);
    const GET = createRetentionCronHandler({
      cronSecret: "top-secret",
      now: () => new Date("2026-08-23T00:00:00.000Z"),
    });

    const response = await GET(makeRequest("Bearer top-secret"));
    const body = (await response.json()) as {
      deletedToolEvents: number;
      deletedQuestionEvents: number;
    };

    expect(response.status).toBe(200);
    expect(body.deletedToolEvents).toBe(2);
    expect(body.deletedQuestionEvents).toBe(2);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("treats a missing cron secret as authorized (local dev without CRON_SECRET configured)", async () => {
    const { client } = fakeDbClient();
    vi.mocked(db.loadDbConfig).mockReturnValue({ connectionString: "postgres://fixture" });
    vi.mocked(db.createDbClient).mockReturnValue(client);
    const GET = createRetentionCronHandler({ cronSecret: undefined });

    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
  });

  it("returns 500 without throwing when DATABASE_URL is not configured", async () => {
    vi.mocked(db.loadDbConfig).mockImplementation(() => {
      throw new db.MissingDatabaseUrlError();
    });
    const GET = createRetentionCronHandler({ cronSecret: undefined });

    const response = await GET(makeRequest());

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(typeof body.error).toBe("string");
  });

  it("returns 500 and still closes the db client when the retention job itself throws", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const throwingSql = (() => {
      throw new Error("connection reset");
    }) as unknown as DbClient["sql"];
    vi.mocked(db.loadDbConfig).mockReturnValue({ connectionString: "postgres://fixture" });
    vi.mocked(db.createDbClient).mockReturnValue({ sql: throwingSql, close });
    const GET = createRetentionCronHandler({ cronSecret: undefined });

    const response = await GET(makeRequest());

    expect(response.status).toBe(500);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
