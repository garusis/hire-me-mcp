import type { Sql } from "postgres";
import { describe, expect, it } from "vitest";
import { resetCareerChunks } from "./reset-career-chunks.js";

/**
 * A minimal fake of the subset of postgres.js's `Sql` this module calls: a
 * single tagged-template statement. No real driver or network involved —
 * real end-to-end behavior against a live, already-migrated branch is
 * covered by ingest/run.integration.test.ts and search-career.integration.test.ts,
 * which call this before seeding/asserting so a branch that inherited
 * production's `career_chunks` rows (#173) starts each suite empty.
 */
function createFakeSql() {
  const calls: string[] = [];

  function fakeTag(strings: TemplateStringsArray, ..._values: unknown[]): Promise<unknown[]> {
    calls.push(strings.join("?"));
    return Promise.resolve([]);
  }

  return { sql: fakeTag as unknown as Sql, calls };
}

describe("resetCareerChunks", () => {
  it("truncates the career_chunks table so a suite starts from an empty table", async () => {
    const { sql, calls } = createFakeSql();

    await resetCareerChunks(sql);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/TRUNCATE TABLE career_chunks/i);
  });

  it("resets identity/sequences (RESTART IDENTITY) rather than a bare delete", async () => {
    const { sql, calls } = createFakeSql();

    await resetCareerChunks(sql);

    expect(calls[0]).toMatch(/RESTART IDENTITY/i);
  });
});
