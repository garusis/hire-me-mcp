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

  it("the second migration adds an embedding_model column to career_chunks (#24)", () => {
    const second = migrations.find((m) => m.id === "002_add_embedding_model");
    expect(second).toBeDefined();
    const sql = second?.statements.join("\n") ?? "";
    expect(sql).toMatch(/ALTER TABLE career_chunks/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS embedding_model text NOT NULL DEFAULT ''/);
  });

  it("the third migration creates the anonymized analytics event tables with time-range and group-by indexes (#79)", () => {
    const third = migrations.find((m) => m.id === "003_add_analytics_events");
    expect(third).toBeDefined();
    const sql = third?.statements.join("\n") ?? "";
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS analytics_tool_events/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS analytics_question_events/);
    // Time-range queries (retention job, "events in the last N days").
    expect(sql).toMatch(
      /analytics_tool_events_created_at_idx.*ON analytics_tool_events \(created_at\)/s,
    );
    expect(sql).toMatch(
      /analytics_question_events_created_at_idx.*ON analytics_question_events \(created_at\)/s,
    );
    // Group-by queries ("counts per tool", "counts per theme").
    expect(sql).toMatch(/ON analytics_tool_events \(tool_name, created_at\)/);
    expect(sql).toMatch(/ON analytics_question_events \(theme, created_at\)/);
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
