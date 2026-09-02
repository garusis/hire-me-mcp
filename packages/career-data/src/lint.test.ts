import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatLintReport, runLint } from "./lint.js";

const fixtureDir = (name: string) =>
  fileURLToPath(new URL(`./content/__fixtures__/${name}/`, import.meta.url));

describe("runLint", () => {
  it("returns ok: true for a lint-clean content directory", () => {
    const result = runLint(fixtureDir("lint-valid-content"));
    expect(result.ok).toBe(true);
    expect(result.violations.every((v) => v.severity !== "error")).toBe(true);
  });

  it("returns ok: false and names the rule, file and entityId for a broken content directory", () => {
    const result = runLint(fixtureDir("lint-broken-content"));
    expect(result.ok).toBe(false);

    const citationViolation = result.violations.find((v) => v.rule === "citation-resolves");
    expect(citationViolation).toMatchObject({
      rule: "citation-resolves",
      severity: "error",
      file: "skills.json",
      entityId: "typescript",
    });

    const tagViolation = result.violations.find((v) => v.rule === "tag-in-vocabulary");
    expect(tagViolation).toMatchObject({
      rule: "tag-in-vocabulary",
      severity: "error",
      file: "experience/fixture-role.json",
      entityId: "fixture-role-fixtureco-2020",
    });
  });

  it("flags a story whose primary and related experience ids do not resolve, naming the story file", () => {
    const result = runLint(fixtureDir("lint-broken-content"));
    const storyViolations = result.violations.filter((v) => v.rule === "story-experience-resolves");
    expect(storyViolations).toHaveLength(2);
    for (const violation of storyViolations) {
      expect(violation).toMatchObject({
        severity: "error",
        file: "stories/fixture-story.json",
        entityId: "fixture-story",
      });
    }
    expect(storyViolations.map((v) => v.message).join("\n")).toMatch(/does-not-exist/);
    expect(storyViolations.map((v) => v.message).join("\n")).toMatch(/also-does-not-exist/);
  });

  it("reports a story with an invalid competency as a schema error naming the story file", () => {
    const result = runLint(fixtureDir("invalid-content"));
    expect(result.ok).toBe(false);
    expect(result.schemaErrors).toContainEqual(
      expect.objectContaining({ file: "stories/fixture-story.json", path: "primaryCompetency" }),
    );
  });

  it("accepts a story whose related experience resolves to a second real experience entry", () => {
    const result = runLint(fixtureDir("lint-valid-content"));
    expect(result.ok).toBe(true);
    expect(result.violations.some((v) => v.rule === "story-experience-resolves")).toBe(false);
  });

  it("flags every broken preservation-map entry in the broken fixture, naming the map file (#290)", () => {
    const result = runLint(fixtureDir("lint-broken-content"));
    const violations = result.violations.filter(
      (v) => v.rule === "story-preservation-map-resolves",
    );
    expect(violations.length).toBeGreaterThanOrEqual(4);
    for (const violation of violations) {
      expect(violation).toMatchObject({ severity: "error", file: "story-preservation-map.json" });
    }
    const messages = violations.map((v) => v.message).join("\n");
    expect(messages).toMatch(/detailed-story.*no story/);
    expect(messages).toMatch(/highlights\.7/);
    expect(messages).toMatch(/no-such-story/);
    expect(messages).toMatch(/does-not-exist-role/);
  });

  it("accepts the valid fixture map, including a story associated through relatedExperienceIds", () => {
    const result = runLint(fixtureDir("lint-valid-content"));
    expect(result.violations.some((v) => v.rule === "story-preservation-map-resolves")).toBe(false);
  });

  it("reports a preservation map with an out-of-set classification as a schema error", () => {
    const result = runLint(fixtureDir("invalid-content"));
    expect(result.schemaErrors).toContainEqual(
      expect.objectContaining({ file: "story-preservation-map.json", path: "[0].classification" }),
    );
  });

  it("reports every violation in a run, not just the first", () => {
    const result = runLint(fixtureDir("lint-broken-content"));
    const rules = new Set(result.violations.map((v) => v.rule));
    expect(rules.has("citation-resolves")).toBe(true);
    expect(rules.has("tag-in-vocabulary")).toBe(true);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });

  it("returns ok: false with schemaErrors (not rule violations) when the content directory is not even schema-valid", () => {
    const result = runLint(fixtureDir("invalid-content"));
    expect(result.ok).toBe(false);
    expect(result.schemaErrors.length).toBeGreaterThan(0);
    expect(result.violations).toEqual([]);
  });

  it("exits clean on an empty content directory (nothing to lint)", () => {
    const result = runLint(fixtureDir("empty-content"));
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.schemaErrors).toEqual([]);
  });
});

describe("formatLintReport", () => {
  it("groups violations by rule name and includes file, entityId and message", () => {
    const result = runLint(fixtureDir("lint-broken-content"));
    const report = formatLintReport(result);
    expect(report).toContain("citation-resolves");
    expect(report).toContain("tag-in-vocabulary");
    expect(report).toContain("skills.json");
    expect(report).toContain("experience/fixture-role.json");
    expect(report).toContain("typescript");
    expect(report).toContain("fixture-role-fixtureco-2020");
  });

  it("reports a clean summary when there are no violations", () => {
    const result = runLint(fixtureDir("lint-valid-content"));
    const report = formatLintReport(result);
    expect(report).toMatch(/no (error|rule)/i);
  });

  it("surfaces schema errors distinctly when content isn't even schema-valid", () => {
    const result = runLint(fixtureDir("invalid-content"));
    const report = formatLintReport(result);
    expect(report).toMatch(/schema/i);
    expect(report).toContain("profile.json");
  });
});
