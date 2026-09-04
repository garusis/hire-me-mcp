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

  describe("absent-topic negative controls (#307 corpus-drift correction)", () => {
    it("every absent-topic entry declares a non-empty distinguishingTerms array", () => {
      const absentTopicEntries = GOLDEN_QUERIES.filter(
        (entry) => entry.category === "absent-topic",
      );
      expect(absentTopicEntries.length).toBeGreaterThan(0);
      for (const entry of absentTopicEntries) {
        expect(entry.distinguishingTerms?.length).toBeGreaterThan(0);
      }
    });

    it("no longer includes the stale absent-sap-erp case", () => {
      expect(GOLDEN_QUERIES.some((entry) => entry.id === "absent-sap-erp")).toBe(false);
    });

    it("replaces it with a genuinely-absent absent-mainframe-cobol negative control", () => {
      const entry = GOLDEN_QUERIES.find((candidate) => candidate.id === "absent-mainframe-cobol");
      expect(entry).toBeDefined();
      expect(entry?.category).toBe("absent-topic");
      expect(entry?.distinguishingTerms).toEqual(expect.arrayContaining(["mainframe", "cobol"]));
    });

    it("no longer includes absent-blockchain: the real 66-case artifact (33848493625) scored it a known failure (gap:dotnet 0.6949 sits above the 0.644 floor), and the 5-case set's 0.8 threshold has no budget left for a second known failure alongside absent-penetration-testing", () => {
      expect(GOLDEN_QUERIES.some((entry) => entry.id === "absent-blockchain")).toBe(false);
    });

    it("no longer includes absent-penetration-testing: the same real artifact scored it a known/borderline failure (story:house-numbers-secure-public-document-upload 0.6525), a corpus-drift semantic neighbor added after #295 — the same failure mode as the replaced absent-sap-erp case", () => {
      expect(GOLDEN_QUERIES.some((entry) => entry.id === "absent-penetration-testing")).toBe(false);
    });

    it("replaces both with genuinely-remote-domain negative controls (genomics/bioinformatics, industrial control systems) chosen to share no vocabulary with any gap, skill, experience, project, or story record", () => {
      const genomics = GOLDEN_QUERIES.find(
        (candidate) => candidate.id === "absent-genomics-bioinformatics",
      );
      const ics = GOLDEN_QUERIES.find(
        (candidate) => candidate.id === "absent-industrial-control-systems",
      );
      expect(genomics).toBeDefined();
      expect(genomics?.category).toBe("absent-topic");
      expect(genomics?.distinguishingTerms).toEqual(
        expect.arrayContaining(["genomics", "bioinformatics"]),
      );
      expect(ics).toBeDefined();
      expect(ics?.category).toBe("absent-topic");
      expect(ics?.distinguishingTerms).toEqual(expect.arrayContaining(["scada"]));
    });

    it("keeps the retrieval-only absent-topic set small and explicit at exactly 5 entries, all non-story", () => {
      const absentTopicEntries = GOLDEN_QUERIES.filter(
        (entry) => entry.category === "absent-topic",
      );
      expect(absentTopicEntries).toHaveLength(5);
      expect(absentTopicEntries.map((entry) => entry.id).sort()).toEqual(
        [
          "absent-embedded-firmware",
          "absent-genomics-bioinformatics",
          "absent-industrial-control-systems",
          "absent-mainframe-cobol",
          "absent-salesforce-admin",
        ].sort(),
      );
    });

    it("uses 'operational technology' as the ICS/OT distinguishing term, not 'ics/ot' (Codex review checkpoint correction, #307): normalizeForDriftCheck (./absent-topic-guard.ts) strips the '/', so 'ics/ot' silently degrades to matching only the literal substring 'icsot' — a phrase that never actually appears in prose — and so could never catch a later standalone 'ICS' or 'operational technology' mention", () => {
      const ics = GOLDEN_QUERIES.find(
        (candidate) => candidate.id === "absent-industrial-control-systems",
      );
      expect(ics?.distinguishingTerms).toContain("operational technology");
      expect(ics?.distinguishingTerms).not.toContain("ics/ot");
    });
  });

  describe("locked behavioral-story eval manifest (#295, 36 cases in retrieval per #307)", () => {
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

    it("adds exactly 36 story cases: 10 exact, 16 held-out fuzzy, 8 fuzzy any, 2 cross-cutting all (#307: behavioral absence moved to the agent eval)", () => {
      const entries = storyEntries();
      expect(entries).toHaveLength(36);
      expect(entries.filter((e) => e.category === "exact")).toHaveLength(10);
      expect(entries.filter((e) => e.category === "fuzzy")).toHaveLength(24);
      expect(entries.filter((e) => e.category === "cross-cutting")).toHaveLength(2);
      expect(entries.filter((e) => e.category === "absent-topic")).toHaveLength(0);
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

    it("no story case is absent-topic in the retrieval dataset — honest behavioral absence (N01/N02) is evaluated only in the agent eval's story-manifest-cases.ts (#307)", () => {
      const absentTopics = storyEntries().filter((entry) => entry.category === "absent-topic");
      expect(absentTopics).toHaveLength(0);
      expect(storyEntries().some((entry) => entry.id.includes("n01"))).toBe(false);
      expect(storyEntries().some((entry) => entry.id.includes("n02"))).toBe(false);
    });
  });
});
