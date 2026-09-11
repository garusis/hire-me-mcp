import { describe, expect, it } from "vitest";
import { chunkCareerData } from "../../chunking/index.js";
import { createContentCareerDataRepository } from "../../repository.js";
import { checkAbsentTopicDrift, normalizeForDriftCheck } from "./absent-topic-guard.js";
import type { GoldenQuery } from "./schema.js";

function absentQuery(overrides: Partial<GoldenQuery> = {}): GoldenQuery {
  return {
    id: "absent-test",
    query: "Does he have some genuinely absent skill?",
    category: "absent-topic",
    expectedSources: [],
    expectEmpty: true,
    distinguishingTerms: ["absent skill"],
    ...overrides,
  };
}

describe("normalizeForDriftCheck", () => {
  it("lowercases, strips punctuation, and collapses whitespace", () => {
    expect(normalizeForDriftCheck("SAP, ERP!\nsystems")).toBe("sap erp systems");
  });
});

describe("checkAbsentTopicDrift", () => {
  it("passes when no distinguishing term appears in any chunk", () => {
    const queries = [absentQuery()];
    const chunks = [{ sourceType: "story", sourceId: "s1", text: "A completely unrelated story." }];
    expect(checkAbsentTopicDrift(queries, chunks)).toEqual({ valid: true, violations: [] });
  });

  it("fails when a distinguishing term appears in a chunk", () => {
    const queries = [absentQuery({ distinguishingTerms: ["mainframe", "cobol"] })];
    const chunks = [
      { sourceType: "story", sourceId: "s1", text: "Migrated a legacy COBOL mainframe job." },
    ];
    const result = checkAbsentTopicDrift(queries, chunks);
    expect(result.valid).toBe(false);
    expect(result.violations).toContainEqual({
      queryId: "absent-test",
      sourceType: "story",
      sourceId: "s1",
      term: "mainframe",
    });
    expect(result.violations).toContainEqual({
      queryId: "absent-test",
      sourceType: "story",
      sourceId: "s1",
      term: "cobol",
    });
  });

  it("is case/punctuation insensitive", () => {
    const queries = [absentQuery({ distinguishingTerms: ["smart contract"] })];
    const chunks = [
      { sourceType: "story", sourceId: "s1", text: "Built a  SMART, contract! prototype." },
    ];
    expect(checkAbsentTopicDrift(queries, chunks).valid).toBe(false);
  });

  it("ignores non-absent-topic categories (they declare no distinguishingTerms)", () => {
    const queries: GoldenQuery[] = [
      {
        id: "exact-1",
        query: "does not matter",
        category: "exact",
        expectedSources: [{ sourceType: "skill", sourceId: "typescript" }],
      },
    ];
    const chunks = [{ sourceType: "skill", sourceId: "typescript", text: "TypeScript expert." }];
    expect(checkAbsentTopicDrift(queries, chunks)).toEqual({ valid: true, violations: [] });
  });

  it("is lexical only, NOT proof of embedding/semantic separation: a semantically related but lexically distinct phrase is not flagged", () => {
    // "digital ledger technology" is blockchain-adjacent in meaning but shares no substring
    // with "blockchain" or "smart contract" — this guard cannot and does not catch that kind
    // of drift. Real semantic proximity (e.g. a gap record's generic "no production X
    // experience" framing landing close to an absent-topic query in embedding space) can only
    // be confirmed or ruled out by an actual retrieval eval run against a real embedding
    // model, never by this lexical substring check alone.
    const queries = [absentQuery({ distinguishingTerms: ["blockchain", "smart contract"] })];
    const chunks = [
      {
        sourceType: "story",
        sourceId: "s1",
        text: "Explored a digital ledger technology prototype for supply-chain provenance.",
      },
    ];
    expect(checkAbsentTopicDrift(queries, chunks)).toEqual({ valid: true, violations: [] });
  });

  it("a slash-joined term like 'ics/ot' normalizes to a concatenated form ('icsot') that fails to catch a standalone 'ICS' or 'operational technology' mention — the dishonesty the ./cases.ts absent-industrial-control-systems entry now avoids by using the full phrase 'operational technology' instead (Codex review checkpoint correction, #307)", () => {
    const chunks = [
      {
        sourceType: "story",
        sourceId: "s1",
        text: "Modernized operational technology monitoring for a manufacturing plant's ICS network.",
      },
    ];

    const dishonestTerm = [absentQuery({ distinguishingTerms: ["ics/ot"] })];
    expect(checkAbsentTopicDrift(dishonestTerm, chunks)).toEqual({ valid: true, violations: [] });

    const honestTerm = [absentQuery({ distinguishingTerms: ["operational technology"] })];
    expect(checkAbsentTopicDrift(honestTerm, chunks).valid).toBe(false);
  });

  it("the real committed corpus has zero corpus-drift violations for ./cases.ts's absent-topic entries", async () => {
    const { GOLDEN_QUERIES } = await import("./cases.js");
    const repository = createContentCareerDataRepository();
    const chunks = chunkCareerData(repository.getDataset());
    const result = checkAbsentTopicDrift(GOLDEN_QUERIES, chunks);
    expect(result).toEqual({ valid: true, violations: [] });
  });
});
