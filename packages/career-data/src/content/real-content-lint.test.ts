import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runRules } from "../lint/rules.js";
import { formatLintReport, runLint } from "../lint.js";
import { loadContentDirWithSources, loadStoryPreservationMap } from "./loader.js";

/**
 * Runs the #51 content-lint rule engine against the *real* authored content
 * in `content/` — the migration target for the ad-hoc cross-entity
 * assertions written inline in #48/#50 (citation resolution, gap
 * discipline, tag vocabulary, id/alias uniqueness). Those invariants are
 * now enforced once, by name, in `src/lint/rules.ts` (with their own
 * passing/failing fixtures in `src/lint/rules.test.ts`) — this file only
 * asserts that the real content set actually satisfies them, so a
 * regression in authored content fails here first.
 */
const contentDir = fileURLToPath(new URL("../../content/", import.meta.url));

describe("real career-data content — lint (#51)", () => {
  it("has no error-severity rule violations", () => {
    const result = runLint(contentDir);
    const errors = result.violations.filter((violation) => violation.severity === "error");
    expect(errors, formatLintReport(result)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("has no schema errors (content loads and lints on the same, already-valid dataset)", () => {
    const result = runLint(contentDir);
    expect(result.schemaErrors).toEqual([]);
  });

  it("flags exactly the known orphan entries, at warning severity only", () => {
    const result = runLint(contentDir);
    const orphanIds = result.violations
      .filter((violation) => violation.rule === "no-orphan-entities")
      .map((violation) => violation.entityId)
      .sort();
    // Two education credentials no skill cites, plus the hire-me-mcp
    // flagship write-up (#191) — a brand-new project record not yet cited
    // as evidence by any skill. Legitimate warnings, per the rule's own
    // docstring, not errors.
    expect(orphanIds).toEqual(
      [
        "unad-bs-systems-engineering",
        "international-scrum-institute-2020-scrum-master-product-owner",
        "hire-me-mcp",
      ].sort(),
    );
    expect(
      result.violations.every((v) => v.rule !== "no-orphan-entities" || v.severity === "warning"),
    ).toBe(true);
  });

  it("gates the real corpus on preservation-map completeness in the lint itself: dropping one real row is a blocking lint error (#290)", () => {
    const { dataset, sources } = loadContentDirWithSources(contentDir);
    const map = loadStoryPreservationMap(contentDir);
    const dropped = map.find((entry) => entry.classification === "detailed-story");
    if (dropped === undefined) throw new Error("real map has no detailed-story row");
    const violations = runRules({
      dataset,
      sources,
      storyPreservationMap: map.filter((entry) => entry !== dropped),
    }).filter((violation) => violation.rule === "story-preservation-map-complete");
    expect(violations).toEqual([
      expect.objectContaining({
        severity: "error",
        file: "story-preservation-map.json",
        entityId: `${dropped.experienceId}#${dropped.field}`,
      }),
    ]);
  });
});
