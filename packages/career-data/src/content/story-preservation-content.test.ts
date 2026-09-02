import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadContentDir, loadStoryPreservationMap } from "./loader.js";

/**
 * Real-content invariants over `content/story-preservation-map.json` — the
 * #290 audit that classifies every experience `summary` and `highlights.N`
 * and maps each detailed, interview-worthy field to the canonical story
 * that preserves its evidence. #297 consumes this map; it may not shorten
 * or remove detailed prose that is not mapped here.
 *
 * The cross-entity resolution rules (experience exists, field exists,
 * story exists and is associated with the experience, detailed fields name
 * a story) are enforced by name in `src/lint/rules.ts`
 * (`story-preservation-map-resolves`) and asserted against real content in
 * `real-content-lint.test.ts`. This file asserts what only the real corpus
 * can: completeness, and the specific fields selected for cleanup.
 */
const contentDir = fileURLToPath(new URL("../../content/", import.meta.url));

/** Every field selected for cleanup in #297 and the story that preserves it. */
const DETAILED_FIELDS_SELECTED_FOR_CLEANUP = [
  {
    experienceId: "house-numbers-2022-senior-full-stack-engineer",
    field: "highlights.1",
    storyIds: ["house-numbers-communication-service-ownership"],
  },
  {
    experienceId: "xogito-group-2020-senior-software-development-engineer",
    field: "highlights.1",
    storyIds: ["xogito-client-account-recovery"],
  },
  {
    experienceId: "fullstack-labs-2018-senior-software-engineer",
    field: "highlights.1",
    storyIds: ["fullstack-labs-sap-migration"],
  },
];

describe("real content: story-preservation-map.json (#290)", () => {
  const dataset = loadContentDir(contentDir);
  const map = loadStoryPreservationMap(contentDir);

  it("is committed as a review fixture and loads through the career-data loader", () => {
    expect(fs.existsSync(path.join(contentDir, "story-preservation-map.json"))).toBe(true);
    expect(map.length).toBeGreaterThan(0);
  });

  it("classifies every experience summary and every highlight exactly once, with no stray entries", () => {
    const expected = dataset.experience
      .flatMap((entry) => [
        `${entry.id}#summary`,
        ...entry.highlights.map((_, index) => `${entry.id}#highlights.${index}`),
      ])
      .sort();
    const actual = map.map((entry) => `${entry.experienceId}#${entry.field}`).sort();
    expect(actual).toEqual(expected);
  });

  it("maps every field selected for cleanup to its canonical story", () => {
    for (const expected of DETAILED_FIELDS_SELECTED_FOR_CLEANUP) {
      const entry = map.find(
        (candidate) =>
          candidate.experienceId === expected.experienceId && candidate.field === expected.field,
      );
      expect(entry, `${expected.experienceId}#${expected.field}`).toBeDefined();
      expect(entry?.classification).toBe("detailed-story");
      expect(entry?.storyIds).toEqual(expected.storyIds);
      expect(entry?.action).not.toBe("keep");
    }
  });

  it("has no detailed-story field beyond the ones selected for cleanup — a new one needs a story first", () => {
    const detailed = map
      .filter((entry) => entry.classification === "detailed-story")
      .map((entry) => `${entry.experienceId}#${entry.field}`)
      .sort();
    expect(detailed).toEqual(
      DETAILED_FIELDS_SELECTED_FOR_CLEANUP.map((e) => `${e.experienceId}#${e.field}`).sort(),
    );
  });

  it("every detailed-story entry names at least one real story", () => {
    const storyIds = new Set(dataset.stories.map((story) => story.id));
    for (const entry of map) {
      if (entry.classification !== "detailed-story") continue;
      expect(entry.storyIds?.length ?? 0, `${entry.experienceId}#${entry.field}`).toBeGreaterThan(
        0,
      );
      for (const storyId of entry.storyIds ?? []) {
        expect(storyIds.has(storyId), storyId).toBe(true);
      }
    }
  });

  it("flags the Xogito recovery highlight for correction, not just shortening (#305 point 9 causal claim)", () => {
    const entry = map.find(
      (candidate) =>
        candidate.experienceId === "xogito-group-2020-senior-software-development-engineer" &&
        candidate.field === "highlights.1",
    );
    expect(entry?.action).toBe("correct-inconsistency");
    expect(entry?.note).toMatch(/won the company further work/);
  });

  it("keeps every summary as role-level context", () => {
    for (const entry of map.filter((candidate) => candidate.field === "summary")) {
      expect(entry.classification, entry.experienceId).toBe("role-context");
      expect(entry.action, entry.experienceId).toBe("keep");
    }
  });

  it("records why the document-extraction PoC highlight has no story (owner paused it; #300 project is canonical)", () => {
    const entry = map.find(
      (candidate) =>
        candidate.experienceId === "house-numbers-2022-senior-full-stack-engineer" &&
        candidate.field === "highlights.0",
    );
    expect(entry?.classification).not.toBe("detailed-story");
    expect(entry?.storyIds).toBeUndefined();
    expect(entry?.note).toMatch(/document-extraction-pipeline/);
    expect(entry?.note).toMatch(/#300/);
  });
});
