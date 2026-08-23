import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../db/migrate.js";
import type { NeonBranchConfig } from "../db/neon-branch.js";
import {
  createNeonTestBranch,
  deleteNeonTestBranch,
  loadNeonBranchConfig,
} from "../db/neon-branch.js";
import {
  deleteExpiredAnalyticsEvents,
  insertQuestionEvent,
  insertToolEvent,
  resetAnalyticsEvents,
} from "./analytics-repository.js";

/**
 * Real-Neon integration suite for #79: creates a throwaway branch off the
 * project's Neon database, runs migrations against it (including
 * `003_add_analytics_events`), and exercises the analytics repository's
 * insert + retention-delete paths against real Postgres — the fake-`sql`
 * unit tests (`analytics-repository.test.ts`) cover the query shape, this
 * suite covers that the shape is actually valid SQL against the real
 * schema and that indexes/constraints behave as expected.
 *
 * Skips cleanly (not silently, not a hard failure) when NEON_API_KEY /
 * NEON_PROJECT_ID aren't set — mirrors `db/rag-store.integration.test.ts`.
 *
 * Test branches fork from the project's default (already-migrated,
 * non-empty) Neon branch (#165) — `resetAnalyticsEvents` truncates both
 * analytics tables right after connecting, the same "reset inherited
 * state inside this disposable branch" pattern `reset-career-chunks.ts`
 * established for `career_chunks`.
 */
const neonConfig: NeonBranchConfig | undefined = loadNeonBranchConfig();

type TestSql = ReturnType<typeof postgres>;

describe.runIf(neonConfig !== undefined)("Analytics events store (real Neon branch)", () => {
  let branchId: string | undefined;
  let sql: TestSql | undefined;

  beforeAll(async () => {
    if (neonConfig === undefined) return;
    const branch = await createNeonTestBranch(neonConfig, "hire-me-mcp-core-analytics-it");
    branchId = branch.branchId;
    sql = postgres(branch.connectionUri, { max: 1, ssl: "require", connect_timeout: 30 });

    // Neon computes cold-start on first connection — retry briefly instead
    // of failing on a transient "endpoint is not ready yet".
    const deadline = Date.now() + 30_000;
    for (;;) {
      try {
        await sql`SELECT 1`;
        break;
      } catch (error) {
        if (Date.now() > deadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    await runMigrations(sql);
    // The forked branch may already have rows from the real database —
    // this suite asserts exact counts, so it must start from empty.
    await resetAnalyticsEvents(sql);
  }, 60_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    if (neonConfig !== undefined && branchId !== undefined) {
      await deleteNeonTestBranch(neonConfig, branchId);
    }
  }, 30_000);

  it("inserts a tool event and it's queryable by its stored fields", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    await insertToolEvent(sql, {
      surface: "mcp",
      toolName: "get-profile",
      outcome: "success",
      latencyMs: 42,
    });

    const rows =
      await sql`SELECT surface, tool_name, outcome, latency_bucket FROM analytics_tool_events`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      surface: "mcp",
      tool_name: "get-profile",
      outcome: "success",
      latency_bucket: "under_100ms",
    });
  });

  it("inserts a question event and it's queryable by its stored fields", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    await insertQuestionEvent(sql, {
      theme: "technology",
      latencyMs: 1500,
      usedRetrieval: true,
    });

    const rows =
      await sql`SELECT theme, latency_bucket, used_retrieval FROM analytics_question_events WHERE theme = 'technology'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      theme: "technology",
      latency_bucket: "under_2s",
      used_retrieval: true,
    });
  });

  it("the retention delete removes only rows older than the given cutoff", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    await resetAnalyticsEvents(sql);

    const oldCutoff = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    await sql`
      INSERT INTO analytics_tool_events (surface, tool_name, outcome, latency_bucket, created_at)
      VALUES ('mcp', 'ping', 'success', 'under_100ms', ${oldCutoff})
    `;
    await insertToolEvent(sql, {
      surface: "mcp",
      toolName: "ping",
      outcome: "success",
      latencyMs: 5,
    });

    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const result = await deleteExpiredAnalyticsEvents(sql, cutoff);

    expect(result.deletedToolEvents).toBe(1);
    const remaining = await sql`SELECT tool_name, created_at FROM analytics_tool_events`;
    expect(remaining).toHaveLength(1);
    expect(new Date((remaining[0] as { created_at: Date }).created_at).getTime()).toBeGreaterThan(
      cutoff.getTime(),
    );
  });

  it("the time-range and group-by indexes exist on both tables", async () => {
    if (sql === undefined) throw new Error("sql not initialized");
    const toolIndexes = await sql`
      SELECT indexname FROM pg_indexes WHERE tablename = 'analytics_tool_events'
    `;
    const toolIndexNames = toolIndexes.map((row) => (row as { indexname: string }).indexname);
    expect(toolIndexNames).toContain("analytics_tool_events_created_at_idx");
    expect(toolIndexNames).toContain("analytics_tool_events_tool_name_created_at_idx");

    const questionIndexes = await sql`
      SELECT indexname FROM pg_indexes WHERE tablename = 'analytics_question_events'
    `;
    const questionIndexNames = questionIndexes.map(
      (row) => (row as { indexname: string }).indexname,
    );
    expect(questionIndexNames).toContain("analytics_question_events_created_at_idx");
    expect(questionIndexNames).toContain("analytics_question_events_theme_created_at_idx");
  });
});

if (neonConfig === undefined) {
  console.log(
    "Skipping analytics events integration suite: NEON_API_KEY and/or NEON_PROJECT_ID are not " +
      "set. See packages/core/README.md 'Running the DB integration suite locally' to run it.",
  );
}
