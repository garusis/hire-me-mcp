import type { Sql } from "postgres";
import { describe, expect, it } from "vitest";
import { formatMigrateSummary, runMigrations } from "./migrate.js";
import type { Migration } from "./migrations.js";

describe("formatMigrateSummary", () => {
  it("reports which migrations were applied", () => {
    expect(formatMigrateSummary({ appliedMigrationIds: ["001_init_pgvector_chunks"] })).toBe(
      "Applied 1 migration: 001_init_pgvector_chunks",
    );
  });

  it("pluralizes for more than one applied migration", () => {
    expect(formatMigrateSummary({ appliedMigrationIds: ["001_a", "002_b"] })).toBe(
      "Applied 2 migrations: 001_a, 002_b",
    );
  });

  it("reports a no-op when nothing was applied", () => {
    expect(formatMigrateSummary({ appliedMigrationIds: [] })).toBe(
      "Already up to date — no migrations applied.",
    );
  });
});

/**
 * A minimal fake of the subset of postgres.js's `Sql` this module calls:
 * `sql.unsafe(...)` for DDL, a tagged-template call for `SELECT`/`INSERT`,
 * and `sql.begin(fn)` for transactions. No real driver or network
 * involved — real end-to-end behavior (idempotent re-run against a live
 * database) is covered by migrate.integration.test.ts.
 */
function createFakeSql(appliedIds: string[]) {
  const unsafeCalls: string[] = [];

  function fakeTag(strings: TemplateStringsArray, ..._values: unknown[]): Promise<unknown[]> {
    const text = strings.join("?");
    if (text.includes("SELECT id FROM schema_migrations")) {
      return Promise.resolve(appliedIds.map((id) => ({ id })));
    }
    if (text.includes("INSERT INTO schema_migrations")) {
      const [id] = _values;
      appliedIds.push(id as string);
      return Promise.resolve([]);
    }
    throw new Error(`fake sql: unexpected tagged query: ${text}`);
  }
  fakeTag.unsafe = async (statement: string) => {
    unsafeCalls.push(statement);
    return [];
  };
  fakeTag.begin = async (fn: (tx: typeof fakeTag) => Promise<void>) => {
    await fn(fakeTag);
  };

  return { sql: fakeTag as unknown as Sql, unsafeCalls };
}

describe("runMigrations", () => {
  it("applies every pending migration and records it as applied", async () => {
    const { sql, unsafeCalls } = createFakeSql([]);
    const testMigrations: Migration[] = [
      { id: "001_a", statements: ["CREATE TABLE a (id text);"] },
      { id: "002_b", statements: ["CREATE TABLE b (id text);", "CREATE INDEX ON b (id);"] },
    ];

    const result = await runMigrations(sql, testMigrations);

    expect(result.appliedMigrationIds).toEqual(["001_a", "002_b"]);
    expect(unsafeCalls).toContain("CREATE TABLE a (id text);");
    expect(unsafeCalls).toContain("CREATE TABLE b (id text);");
    expect(unsafeCalls).toContain("CREATE INDEX ON b (id);");
  });

  it("is idempotent: re-running against already-applied migrations is a no-op", async () => {
    const { sql, unsafeCalls } = createFakeSql(["001_a"]);
    const testMigrations: Migration[] = [
      { id: "001_a", statements: ["CREATE TABLE a (id text);"] },
    ];

    const result = await runMigrations(sql, testMigrations);

    expect(result.appliedMigrationIds).toEqual([]);
    expect(unsafeCalls).not.toContain("CREATE TABLE a (id text);");
  });
});
