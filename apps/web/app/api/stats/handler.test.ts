import type { DbClient } from "@hire-me-mcp/core/db";
import * as db from "@hire-me-mcp/core/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStatsRouteHandler } from "./handler";

vi.mock("@hire-me-mcp/core/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core/db")>();
  return { ...actual, createDbClient: vi.fn(), loadDbConfig: vi.fn() };
});

/**
 * A minimal fake `Sql` returning canned rows for every grouped query
 * `getUsageStats` issues, keyed off distinguishing fragments in the query
 * text — mirrors `packages/core/src/analytics/stats.test.ts`'s fake.
 */
function fakeSql() {
  function tag(strings: TemplateStringsArray): Promise<unknown[]> {
    const text = strings.join("?");
    if (text.includes("tool_name") && text.includes("GROUP BY")) {
      return Promise.resolve([{ surface: "mcp", tool_name: "get-profile", count: "5" }]);
    }
    if (text.includes("surface") && text.includes("GROUP BY") && !text.includes("tool_name")) {
      return Promise.resolve([{ surface: "mcp", count: "5" }]);
    }
    if (text.includes("outcome") && text.includes("GROUP BY")) {
      return Promise.resolve([{ outcome: "success", count: "5" }]);
    }
    if (text.includes("theme") && text.includes("GROUP BY")) {
      return Promise.resolve([{ theme: "experience", count: "2" }]);
    }
    return Promise.resolve([{ tool_total: "5", question_total: "2" }]);
  }
  return { sql: tag as unknown as DbClient["sql"] };
}

function fakeDbClient(): { client: DbClient; close: ReturnType<typeof vi.fn> } {
  const { sql } = fakeSql();
  const close = vi.fn().mockResolvedValue(undefined);
  return { client: { sql, close }, close };
}

function makeRequest(token?: string): Request {
  const url = new URL("https://example.com/api/stats");
  if (token !== undefined) url.searchParams.set("token", token);
  return new Request(url);
}

describe("createStatsRouteHandler", () => {
  afterEach(() => {
    vi.mocked(db.loadDbConfig).mockReset();
    vi.mocked(db.createDbClient).mockReset();
  });

  it("returns 404 without calling the database when no token is given", async () => {
    const GET = createStatsRouteHandler({ statsSecret: "top-secret" });

    const response = await GET(makeRequest());

    expect(response.status).toBe(404);
    expect(db.createDbClient).not.toHaveBeenCalled();
  });

  it("returns 404 when the token doesn't match the configured secret", async () => {
    const GET = createStatsRouteHandler({ statsSecret: "top-secret" });

    const response = await GET(makeRequest("wrong-token"));

    expect(response.status).toBe(404);
    expect(db.createDbClient).not.toHaveBeenCalled();
  });

  it("returns 404 (fail closed) when no stats secret is configured, even if a token is supplied", async () => {
    const GET = createStatsRouteHandler({ statsSecret: undefined });

    const response = await GET(makeRequest("anything"));

    expect(response.status).toBe(404);
    expect(db.createDbClient).not.toHaveBeenCalled();
  });

  it("returns 200 with the rendered aggregates when the token matches", async () => {
    const { client } = fakeDbClient();
    vi.mocked(db.loadDbConfig).mockReturnValue({ connectionString: "postgres://fixture" });
    vi.mocked(db.createDbClient).mockReturnValue(client);
    const GET = createStatsRouteHandler({
      statsSecret: "top-secret",
      now: () => new Date("2026-08-23T00:00:00.000Z"),
    });

    const response = await GET(makeRequest("top-secret"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    expect(body).toContain("get-profile");
    expect(body).toContain("experience");
  });

  it("marks the response noindex (header and in-document meta), since Route Handlers aren't covered by Next's page metadata API", async () => {
    const { client } = fakeDbClient();
    vi.mocked(db.loadDbConfig).mockReturnValue({ connectionString: "postgres://fixture" });
    vi.mocked(db.createDbClient).mockReturnValue(client);
    const GET = createStatsRouteHandler({ statsSecret: "top-secret" });

    const response = await GET(makeRequest("top-secret"));
    const body = await response.text();

    expect(response.headers.get("x-robots-tag")).toMatch(/noindex/);
    expect(body).toMatch(/<meta name="robots" content="noindex/);
  });

  it("returns 404 (not 500, so nothing about the failure leaks) when DATABASE_URL is not configured", async () => {
    vi.mocked(db.loadDbConfig).mockImplementation(() => {
      throw new db.MissingDatabaseUrlError();
    });
    const GET = createStatsRouteHandler({ statsSecret: "top-secret" });

    const response = await GET(makeRequest("top-secret"));

    expect(response.status).toBe(404);
  });
});
