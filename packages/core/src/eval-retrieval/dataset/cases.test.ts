import { describe, expect, it } from "vitest";
import { GOLDEN_QUERIES } from "./cases.js";
import { goldenDatasetSchema } from "./schema.js";

describe("GOLDEN_QUERIES", () => {
  it("is a schema-valid dataset (unique ids, category/expectEmpty/expectedSources consistency)", () => {
    const result = goldenDatasetSchema.safeParse(GOLDEN_QUERIES);
    expect(result.success).toBe(true);
  });

  it("has at least 20 entries (the documented target count)", () => {
    expect(GOLDEN_QUERIES.length).toBeGreaterThanOrEqual(20);
  });

  it("includes at least one entry in each of the four required categories", () => {
    const categories = new Set(GOLDEN_QUERIES.map((entry) => entry.category));
    expect(categories).toEqual(new Set(["exact", "fuzzy", "cross-cutting", "absent-topic"]));
  });

  it("weights the dataset toward fuzzy/cross-cutting over exact", () => {
    const byCategory = (category: string) =>
      GOLDEN_QUERIES.filter((entry) => entry.category === category).length;
    expect(byCategory("fuzzy") + byCategory("cross-cutting")).toBeGreaterThan(byCategory("exact"));
  });

  it("every absent-topic entry has expectEmpty: true and no expected sources", () => {
    const absentTopicEntries = GOLDEN_QUERIES.filter((entry) => entry.category === "absent-topic");
    expect(absentTopicEntries.length).toBeGreaterThan(0);
    for (const entry of absentTopicEntries) {
      expect(entry.expectEmpty).toBe(true);
      expect(entry.expectedSources).toEqual([]);
    }
  });

  describe("document-extraction PoC status (#300)", () => {
    const POC = { sourceType: "project", sourceId: "document-extraction-pipeline" };

    it("no longer treats the PoC as evidence of taking an AI feature from demo to reliable production", () => {
      const demoToProduction = GOLDEN_QUERIES.find(
        (entry) => entry.id === "fuzzy-ai-demo-to-production",
      );
      expect(demoToProduction).toBeDefined();
      expect(demoToProduction?.expectedSources).not.toContainEqual(POC);
    });

    it.each([
      "fuzzy-doc-extraction-production-status",
      "fuzzy-doc-extraction-poc-demonstrated",
      "fuzzy-doc-extraction-vendor-cost-claim",
    ])(
      "%s resolves the PoC project as the record that answers the production-status question",
      (id) => {
        const entry = GOLDEN_QUERIES.find((candidate) => candidate.id === id);
        expect(entry).toBeDefined();
        expect(entry?.expectedSources).toContainEqual(POC);
      },
    );
  });

  describe("locked 38-case behavioral-story eval manifest (#295)", () => {
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

    const storyEntries = () => GOLDEN_QUERIES.filter((entry) => entry.id.startsWith("story-"));

    it("adds exactly 38 story cases: 10 exact, 16 held-out fuzzy, 8 fuzzy any, 2 cross-cutting all, 2 absent-topic", () => {
      const entries = storyEntries();
      expect(entries).toHaveLength(38);
      expect(entries.filter((e) => e.category === "exact")).toHaveLength(10);
      expect(entries.filter((e) => e.category === "fuzzy")).toHaveLength(24);
      expect(entries.filter((e) => e.category === "cross-cutting")).toHaveLength(2);
      expect(entries.filter((e) => e.category === "absent-topic")).toHaveLength(2);
    });

    it("every one of the 16 stable story ids is targeted by at least one story case", () => {
      const targeted = new Set(
        storyEntries().flatMap((entry) =>
          entry.expectedSources.filter((s) => s.sourceType === "story").map((s) => s.sourceId),
        ),
      );
      for (const storyId of STORY_IDS) {
        expect(targeted.has(storyId)).toBe(true);
      }
    });

    it("leadership priority invariant: every case whose acceptable set contains both 001 and 002 prefers 001", () => {
      const withBoth = storyEntries().filter((entry) => {
        const ids = new Set(entry.expectedSources.map((s) => s.sourceId));
        return ids.has("xogito-client-account-recovery") && ids.has("mutual-informal-leadership");
      });
      expect(withBoth.length).toBeGreaterThan(0);
      for (const entry of withBoth) {
        expect(entry.preferredSource).toEqual({
          sourceType: "story",
          sourceId: "xogito-client-account-recovery",
        });
      }
    });

    it("cross-cutting story cases declare matchMode: all", () => {
      const crossCutting = storyEntries().filter((entry) => entry.category === "cross-cutting");
      expect(crossCutting.length).toBeGreaterThan(0);
      for (const entry of crossCutting) {
        expect(entry.matchMode).toBe("all");
      }
    });

    it("every declared preferredSource also appears in that case's expectedSources", () => {
      for (const entry of storyEntries()) {
        if (entry.preferredSource === undefined) continue;
        expect(entry.expectedSources).toContainEqual(entry.preferredSource);
      }
    });

    it("absent-topic story cases cover the competing-priorities and immovable-deadline gaps", () => {
      const absentTopics = storyEntries().filter((entry) => entry.category === "absent-topic");
      expect(absentTopics).toHaveLength(2);
      for (const entry of absentTopics) {
        expect(entry.expectEmpty).toBe(true);
        expect(entry.expectedSources).toEqual([]);
      }
    });
  });
});
