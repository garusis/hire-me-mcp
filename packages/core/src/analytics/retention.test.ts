import type { Sql } from "postgres";
import { describe, expect, it } from "vitest";
import { computeRetentionCutoff, RETENTION_WINDOW_DAYS, runRetentionJob } from "./retention.js";

describe("RETENTION_WINDOW_DAYS", () => {
  it("is a single positive constant", () => {
    expect(RETENTION_WINDOW_DAYS).toBeGreaterThan(0);
    expect(Number.isInteger(RETENTION_WINDOW_DAYS)).toBe(true);
  });
});

describe("computeRetentionCutoff", () => {
  it("returns exactly RETENTION_WINDOW_DAYS before the given clock time", () => {
    const now = new Date("2026-08-23T12:00:00.000Z");
    const cutoff = computeRetentionCutoff(now);
    const expectedMs = now.getTime() - RETENTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBe(expectedMs);
  });
});

describe("runRetentionJob", () => {
  function createFakeSql(rows: Array<{ table: string; createdAt: Date }>) {
    const deletes: Array<{ table: string; cutoff: Date }> = [];
    function fakeTag(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> {
      const text = strings.join("?");
      const table = text.includes("analytics_tool_events")
        ? "analytics_tool_events"
        : "analytics_question_events";
      const cutoff = values[0] as Date;
      deletes.push({ table, cutoff });
      const survivorsBeforeDelete = rows.filter((r) => r.table === table).length;
      const survivorsAfterDelete = rows.filter(
        (r) => r.table === table && r.createdAt >= cutoff,
      ).length;
      const deletedCount = survivorsBeforeDelete - survivorsAfterDelete;
      // Simulate rows being removed so a second call would report 0.
      rows.splice(
        0,
        rows.length,
        ...rows.filter((r) => !(r.table === table && r.createdAt < cutoff)),
      );
      return Promise.resolve(Object.assign([], { count: deletedCount }));
    }
    return { sql: fakeTag as unknown as Sql, deletes, rows };
  }

  it("uses an injected clock to compute the cutoff and deletes only rows older than the window", async () => {
    const now = new Date("2026-08-23T00:00:00.000Z");
    const cutoff = computeRetentionCutoff(now);
    const oldRow = { table: "analytics_tool_events", createdAt: new Date(cutoff.getTime() - 1) };
    const newRow = { table: "analytics_tool_events", createdAt: new Date(cutoff.getTime() + 1) };
    const { sql, rows } = createFakeSql([oldRow, newRow]);

    const result = await runRetentionJob(sql, now);

    expect(result.deletedToolEvents).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toBe(newRow);
  });

  it("passes the same injected-clock-derived cutoff to both tables", async () => {
    const now = new Date("2026-08-23T00:00:00.000Z");
    const { sql, deletes } = createFakeSql([]);

    await runRetentionJob(sql, now);

    expect(deletes).toHaveLength(2);
    const expectedCutoff = computeRetentionCutoff(now);
    expect(deletes[0]?.cutoff.getTime()).toBe(expectedCutoff.getTime());
    expect(deletes[1]?.cutoff.getTime()).toBe(expectedCutoff.getTime());
  });
});
