import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatLintReport, runLint } from "../lint.js";

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

  it("flags exactly the two known orphan education entries, at warning severity only", () => {
    const result = runLint(contentDir);
    const orphanEducationIds = result.violations
      .filter((violation) => violation.rule === "no-orphan-entities")
      .map((violation) => violation.entityId)
      .sort();
    expect(orphanEducationIds).toEqual(
      [
        "unad-bs-systems-engineering",
        "international-scrum-institute-2020-scrum-master-product-owner",
      ].sort(),
    );
    expect(
      result.violations.every((v) => v.rule !== "no-orphan-entities" || v.severity === "warning"),
    ).toBe(true);
  });
});
