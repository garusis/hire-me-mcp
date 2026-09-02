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
});
