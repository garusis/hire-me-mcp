import { describe, expect, it } from "vitest";
import { migrations, selectPendingMigrations } from "./migrations.js";

describe("migrations registry", () => {
  it("exposes at least one migration with a stable id and non-empty statements", () => {
    expect(migrations.length).toBeGreaterThan(0);
    for (const migration of migrations) {
      expect(migration.id).toMatch(/^\d{3,}_[a-z0-9_]+$/);
      expect(migration.statements.length).toBeGreaterThan(0);
      for (const statement of migration.statements) {
        expect(statement.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("has unique migration ids, in ascending order", () => {
    const ids = migrations.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });

  it("the first migration enables the vector extension, creates career_chunks, and an HNSW index", () => {
    const [first] = migrations;
    const sql = first?.statements.join("\n") ?? "";
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS vector/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS career_chunks/);
    expect(sql).toMatch(/vector\(768\)/);
    expect(sql).toMatch(/USING hnsw/);
    expect(sql).toMatch(/vector_cosine_ops/);
  });
});

describe("selectPendingMigrations", () => {
  it("returns every migration when none have been applied", () => {
    const all = [
      { id: "001_a", statements: ["select 1"] },
      { id: "002_b", statements: ["select 2"] },
    ];
    expect(selectPendingMigrations(all, [])).toEqual(all);
  });

  it("filters out already-applied migration ids", () => {
    const all = [
      { id: "001_a", statements: ["select 1"] },
      { id: "002_b", statements: ["select 2"] },
    ];
    expect(selectPendingMigrations(all, ["001_a"])).toEqual([all[1]]);
  });

  it("returns an empty array when every migration has already been applied (idempotent no-op)", () => {
    const all = [{ id: "001_a", statements: ["select 1"] }];
    expect(selectPendingMigrations(all, ["001_a"])).toEqual([]);
  });

  it("ignores applied ids that don't match any known migration", () => {
    const all = [{ id: "001_a", statements: ["select 1"] }];
    expect(selectPendingMigrations(all, ["999_unknown"])).toEqual(all);
  });
});
