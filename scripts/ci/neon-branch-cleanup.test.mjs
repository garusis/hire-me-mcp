/**
 * #52 — unit tests for the pure stale-Neon-branch selection logic. Plain
 * `node --test`, same convention as `scripts/ci/docs-rot/*.test.mjs`.
 * Run: `node --test scripts/ci/neon-branch-cleanup.test.mjs`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { findStaleBranches } from "./neon-branch-cleanup.mjs";

const NOW = new Date("2026-08-20T12:00:00.000Z");

function branch(overrides = {}) {
  return {
    id: "br-1",
    name: "hire-me-mcp-retrieval-eval-1",
    created_at: "2026-08-19T00:00:00.000Z", // 36h before NOW
    default: false,
    protected: false,
    ...overrides,
  };
}

test("findStaleBranches selects a hire-me-mcp-* branch older than the max age", () => {
  const result = findStaleBranches([branch()], { now: NOW });
  assert.deepEqual(
    result.map((b) => b.id),
    ["br-1"],
  );
});

test("findStaleBranches excludes a branch younger than the max age", () => {
  const fresh = branch({ id: "br-fresh", created_at: "2026-08-20T06:00:00.000Z" }); // 6h before NOW
  const result = findStaleBranches([fresh], { now: NOW });
  assert.deepEqual(result, []);
});

test("findStaleBranches excludes a branch whose name doesn't match the prefix", () => {
  const other = branch({ id: "br-other", name: "some-other-branch" });
  const result = findStaleBranches([other], { now: NOW });
  assert.deepEqual(result, []);
});

test("findStaleBranches never selects the project's default branch, even if old and prefix-matching", () => {
  const primary = branch({ id: "br-default", name: "hire-me-mcp-primary", default: true });
  const result = findStaleBranches([primary], { now: NOW });
  assert.deepEqual(result, []);
});

test("findStaleBranches never selects a protected branch", () => {
  const guarded = branch({ id: "br-protected", protected: true });
  const result = findStaleBranches([guarded], { now: NOW });
  assert.deepEqual(result, []);
});

test("findStaleBranches respects a custom maxAgeMs", () => {
  const oneHourOld = branch({ id: "br-1h", created_at: "2026-08-20T11:00:00.000Z" });
  const staleAtOneHour = findStaleBranches([oneHourOld], { now: NOW, maxAgeMs: 30 * 60 * 1000 });
  const notStaleAtTwoHours = findStaleBranches([oneHourOld], {
    now: NOW,
    maxAgeMs: 2 * 60 * 60 * 1000,
  });
  assert.deepEqual(
    staleAtOneHour.map((b) => b.id),
    ["br-1h"],
  );
  assert.deepEqual(notStaleAtTwoHours, []);
});

test("findStaleBranches respects a custom namePrefix", () => {
  const custom = branch({ id: "br-custom", name: "ci-eval-branch-1" });
  const result = findStaleBranches([custom], { now: NOW, namePrefix: "ci-" });
  assert.deepEqual(
    result.map((b) => b.id),
    ["br-custom"],
  );
});
