import type { Sql } from "postgres";
import { describe, expect, it } from "vitest";
import {
  deleteExpiredAnalyticsEvents,
  insertQuestionEvent,
  insertToolEvent,
  resetAnalyticsEvents,
} from "./analytics-repository.js";

/**
 * A minimal fake of the subset of postgres.js's `Sql` this repository
 * calls — a tagged-template call per statement, capturing the interpolated
 * values so tests can assert on exactly what would have been sent, without
 * a real driver or network connection. Mirrors `db/migrate.test.ts`'s
 * `createFakeSql`.
 */
function createFakeSql() {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  function fakeTag(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> {
    calls.push({ text: strings.join("?"), values });
    return Promise.resolve([]);
  }
  return { sql: fakeTag as unknown as Sql, calls };
}

describe("insertToolEvent", () => {
  it("inserts a scrubbed tool event into analytics_tool_events", async () => {
    const { sql, calls } = createFakeSql();

    await insertToolEvent(sql, {
      surface: "mcp",
      toolName: "get-profile",
      outcome: "success",
      latencyMs: 42,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain("INSERT INTO analytics_tool_events");
    expect(calls[0]?.values).toEqual(["mcp", "get-profile", "success", "under_100ms"]);
  });

  it("rejects (never sends) an event that fails scrubbing — e.g. an outcome outside the taxonomy", async () => {
    const { sql, calls } = createFakeSql();

    await expect(
      insertToolEvent(sql, {
        surface: "mcp",
        toolName: "get-profile",
        outcome: "refused" as never,
        latencyMs: 10,
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("insertQuestionEvent", () => {
  it("inserts a scrubbed question event into analytics_question_events", async () => {
    const { sql, calls } = createFakeSql();

    await insertQuestionEvent(sql, {
      theme: "experience",
      latencyMs: 2500,
      usedRetrieval: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain("INSERT INTO analytics_question_events");
    expect(calls[0]?.values).toEqual(["experience", "under_10s", true]);
  });

  it("rejects (never sends) a question event whose theme is not in the fixed taxonomy", async () => {
    const { sql, calls } = createFakeSql();

    await expect(
      insertQuestionEvent(sql, {
        theme: "raw question text would fail here" as never,
        latencyMs: 10,
        usedRetrieval: false,
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("deleteExpiredAnalyticsEvents", () => {
  it("deletes rows older than the given cutoff from both tables", async () => {
    const { sql, calls } = createFakeSql();
    const cutoff = new Date("2026-01-01T00:00:00.000Z");

    await deleteExpiredAnalyticsEvents(sql, cutoff);

    expect(calls).toHaveLength(2);
    expect(calls[0]?.text).toContain("DELETE FROM analytics_tool_events");
    expect(calls[0]?.text).toContain("created_at");
    expect(calls[0]?.values).toEqual([cutoff]);
    expect(calls[1]?.text).toContain("DELETE FROM analytics_question_events");
    expect(calls[1]?.values).toEqual([cutoff]);
  });
});

describe("resetAnalyticsEvents", () => {
  it("truncates both analytics tables — used by integration test setup", async () => {
    const { sql, calls } = createFakeSql();

    await resetAnalyticsEvents(sql);

    expect(calls).toHaveLength(2);
    expect(calls[0]?.text).toContain("TRUNCATE TABLE analytics_tool_events");
    expect(calls[1]?.text).toContain("TRUNCATE TABLE analytics_question_events");
  });
});
