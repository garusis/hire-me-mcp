import type { Sql } from "postgres";
import { describe, expect, it } from "vitest";
import { getUsageStats } from "./stats.js";

/**
 * A minimal fake of postgres.js's tagged-template `Sql` that returns
 * pre-seeded rows keyed by which fragment of the query text it sees —
 * mirrors `analytics-repository.test.ts`'s `createFakeSql`, extended to
 * serve different canned result sets per statement since `getUsageStats`
 * issues several distinct grouped queries.
 */
function createFakeSql(responses: {
  toolCounts?: unknown[];
  surfaceCounts?: unknown[];
  outcomeCounts?: unknown[];
  themeCounts?: unknown[];
  totals?: unknown[];
}) {
  const calls: string[] = [];

  // Ordered [predicate, response] pairs — the first matching predicate
  // wins, so more-specific queries (tool_name+GROUP BY) are listed before
  // less-specific ones (bare GROUP BY) that would otherwise also match.
  const routes: ReadonlyArray<[(text: string) => boolean, unknown[] | undefined]> = [
    [(text) => text.includes("tool_name") && text.includes("GROUP BY"), responses.toolCounts],
    [(text) => text.includes("surface") && text.includes("GROUP BY"), responses.surfaceCounts],
    [(text) => text.includes("outcome") && text.includes("GROUP BY"), responses.outcomeCounts],
    [(text) => text.includes("theme") && text.includes("GROUP BY"), responses.themeCounts],
    [
      (text) => text.includes("COUNT(*)"),
      responses.totals ?? [{ tool_total: 0, question_total: 0 }],
    ],
  ];

  function fakeTag(strings: TemplateStringsArray, ..._values: unknown[]): Promise<unknown[]> {
    const text = strings.join("?");
    calls.push(text);
    const route = routes.find(([matches]) => matches(text));
    return Promise.resolve(route?.[1] ?? []);
  }
  return { sql: fakeTag as unknown as Sql, calls };
}

describe("getUsageStats", () => {
  it("returns counts by tool, surface, outcome and theme over the given range", async () => {
    const { sql } = createFakeSql({
      toolCounts: [
        { surface: "mcp", tool_name: "get-profile", count: "3" },
        { surface: "chat", tool_name: "search-career", count: "1" },
      ],
      surfaceCounts: [
        { surface: "mcp", count: "3" },
        { surface: "chat", count: "1" },
      ],
      outcomeCounts: [
        { outcome: "success", count: "3" },
        { outcome: "rate_limited", count: "1" },
      ],
      themeCounts: [
        { theme: "experience", count: "2" },
        { theme: "other", count: "1" },
      ],
      totals: [{ tool_total: "4", question_total: "3" }],
    });

    const since = new Date("2026-05-01T00:00:00.000Z");
    const until = new Date("2026-08-01T00:00:00.000Z");
    const stats = await getUsageStats(sql, { since, until });

    expect(stats.since).toEqual(since);
    expect(stats.until).toEqual(until);
    expect(stats.toolCounts).toEqual([
      { surface: "mcp", toolName: "get-profile", count: 3 },
      { surface: "chat", toolName: "search-career", count: 1 },
    ]);
    expect(stats.surfaceCounts).toEqual([
      { surface: "mcp", count: 3 },
      { surface: "chat", count: 1 },
    ]);
    expect(stats.outcomeCounts).toEqual([
      { outcome: "success", count: 3 },
      { outcome: "rate_limited", count: 1 },
    ]);
    expect(stats.themeCounts).toEqual([
      { theme: "experience", count: 2 },
      { theme: "other", count: 1 },
    ]);
    expect(stats.totalToolEvents).toBe(4);
    expect(stats.totalQuestionEvents).toBe(3);
  });

  it("defaults `until` to now when not given, and returns zeroed totals for an empty range", async () => {
    const { sql } = createFakeSql({ totals: [{ tool_total: "0", question_total: "0" }] });

    const since = new Date("2026-01-01T00:00:00.000Z");
    const before = new Date();
    const stats = await getUsageStats(sql, { since });
    const after = new Date();

    expect(stats.until.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(stats.until.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(stats.toolCounts).toEqual([]);
    expect(stats.surfaceCounts).toEqual([]);
    expect(stats.outcomeCounts).toEqual([]);
    expect(stats.themeCounts).toEqual([]);
    expect(stats.totalToolEvents).toBe(0);
    expect(stats.totalQuestionEvents).toBe(0);
  });
});
