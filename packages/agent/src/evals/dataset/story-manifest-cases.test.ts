import { COMPETENCIES } from "@hire-me-mcp/core";
import { describe, expect, it } from "vitest";
import { evalDatasetSchema } from "./schema.js";
import { STORY_MANIFEST_CASES } from "./story-manifest-cases.js";

/** Every story ref (mustCiteEntity + citationGroups.refs) a case's answerAssertions names. */
function referencedStoryIds(evalCase: (typeof STORY_MANIFEST_CASES)[number]): string[] {
  const assertions = evalCase.answerAssertions;
  if (!assertions) return [];
  const direct = (assertions.mustCiteEntity ?? []).map((ref) => ref.entityId);
  const grouped = (assertions.citationGroups ?? []).flatMap((group) =>
    group.refs.map((ref) => ref.entityId),
  );
  return [...direct, ...grouped];
}

describe("STORY_MANIFEST_CASES (#295 locked behavioral manifest)", () => {
  it("validates against the dataset schema", () => {
    const result = evalDatasetSchema.safeParse(STORY_MANIFEST_CASES);
    expect(result.success).toBe(true);
  });

  it("has exactly the locked 38 cases", () => {
    expect(STORY_MANIFEST_CASES.length).toBe(38);
  });

  it("has unique ids distinct from the rest of the dataset (story-manifest- prefixed)", () => {
    const ids = STORY_MANIFEST_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^story-manifest-/);
    }
  });

  it("references every one of the 16 locked story stable ids at least once", () => {
    const STORY_IDS = [
      "xogito-client-account-recovery",
      "mutual-informal-leadership",
      "cross-team-onboarding-framework",
      "house-numbers-communication-service-ownership",
      "house-numbers-deterministic-document-checks",
      "fullstack-labs-sap-migration",
      "house-numbers-prompt-platform-migration",
      "house-numbers-secure-public-document-upload",
      "house-numbers-zod-production-incident",
      "house-numbers-vendor-extraction-contract",
      "house-numbers-loan-analysis-pipeline-decomposition",
      "mutual-sustainable-ownership-failure",
      "rokk3r-sustainable-performance-feedback",
      "belatrix-destructive-deployment-accountability",
      "house-numbers-cross-service-debugging-skill",
      "house-numbers-ai-pivot-after-paternity-leave",
    ];
    const referenced = new Set(STORY_MANIFEST_CASES.flatMap((c) => referencedStoryIds(c)));
    for (const storyId of STORY_IDS) {
      expect(referenced.has(storyId)).toBe(true);
    }
  });

  it("names every controlled behavioral competency in at least one case's notes", () => {
    const allNotes = STORY_MANIFEST_CASES.map((c) => c.notes ?? "").join("\n");
    for (const competency of COMPETENCIES) {
      const wordBoundary = new RegExp(`\\b${competency}\\b`);
      expect(allNotes).toMatch(wordBoundary);
    }
  });

  it("routes the locked list count (9), with every remaining case (story-search + absence, 29) on the story-scoped search route", () => {
    const byRoute = new Map<string, number>();
    for (const evalCase of STORY_MANIFEST_CASES) {
      const key = evalCase.expectedToolCall ?? "(none)";
      byRoute.set(key, (byRoute.get(key) ?? 0) + 1);
    }
    expect(byRoute.get("list-career-stories")).toBe(9);
    // story-search (X08, F01-F16, A01-A08, C01-C02 = 27) + absence (N01-N02,
    // reusing the same scorer per its honest-fallback contract — see module
    // docs) = 29.
    expect(byRoute.get("search-career-story-scoped")).toBe(29);
  });

  it("declares expectedCompetencies only for list-career-stories cases", () => {
    for (const evalCase of STORY_MANIFEST_CASES) {
      if (evalCase.expectedToolCall === "list-career-stories") {
        expect(evalCase.expectedCompetencies?.length ?? 0).toBeGreaterThan(0);
      } else {
        expect(evalCase.expectedCompetencies).toBeUndefined();
      }
    }
  });

  it("uses citationGroups mode 'all' for the two cross-cutting cases", () => {
    const crossCutting = STORY_MANIFEST_CASES.filter((c) => c.id.startsWith("story-manifest-c0"));
    expect(crossCutting.length).toBe(2);
    for (const evalCase of crossCutting) {
      expect(evalCase.answerAssertions?.citationGroups?.every((g) => g.mode === "all")).toBe(true);
    }
  });

  it("locks the preferred-source cases to their manifest-declared preference", () => {
    const expectedPreferred: Record<string, string> = {
      "story-manifest-x01": "xogito-client-account-recovery",
      "story-manifest-x02": "mutual-informal-leadership",
      "story-manifest-f02": "mutual-informal-leadership",
      "story-manifest-a01": "house-numbers-deterministic-document-checks",
      "story-manifest-a02": "house-numbers-zod-production-incident",
      "story-manifest-a04": "house-numbers-cross-service-debugging-skill",
    };
    for (const [id, preferredId] of Object.entries(expectedPreferred)) {
      const evalCase = STORY_MANIFEST_CASES.find((c) => c.id === id);
      const groups = evalCase?.answerAssertions?.citationGroups ?? [];
      const preferredGroup = groups.find((g) => g.preferredRef !== undefined);
      expect(preferredGroup?.preferredRef?.entityId).toBe(preferredId);
    }
  });

  it("marks both absent-topic cases as honest gaps expecting no story citation", () => {
    const absentCases = STORY_MANIFEST_CASES.filter((c) => c.id.startsWith("story-manifest-n0"));
    expect(absentCases.length).toBe(2);
    for (const evalCase of absentCases) {
      expect(evalCase.category).toBe("gap");
      expect(evalCase.gapHonestyDirection).toBe("gap");
      expect(referencedStoryIds(evalCase).length).toBe(0);
    }
  });

  it("carries no private personal data (no email addresses or phone-like digit runs)", () => {
    for (const evalCase of STORY_MANIFEST_CASES) {
      const text = `${evalCase.question} ${evalCase.notes ?? ""}`;
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
      expect(text).not.toMatch(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/);
    }
  });
});
