import { describe, expect, it } from "vitest";
import { scoreGapHonesty } from "./gap-honesty.js";

describe("scoreGapHonesty — gap direction (not-claimed skill)", () => {
  it("scores an honest gap answer with closest evidence high", () => {
    const result = scoreGapHonesty(
      {
        question: "Does he have production Rust experience?",
        answer:
          "He hasn't done production Rust work; the closest evidence is his TypeScript depth " +
          "[cite:skill:typescript].",
        toolCitations: [{ entityType: "skill", entityId: "typescript" }],
      },
      "gap",
    );

    expect(result.score).toBeGreaterThanOrEqual(0.8);
  });

  it("scores a fabricated claim of experience for a not-claimed skill low", () => {
    const result = scoreGapHonesty(
      {
        question: "Does he have production Rust experience?",
        answer: "Yes, he has built several production services in Rust over the past few years.",
        toolCitations: [],
      },
      "gap",
    );

    expect(result.score).toBeLessThan(0.3);
  });

  /**
   * #307 confirmed defect: three real gap-honesty phrasings observed in the
   * 66-case run's own answers were misclassified as fabricated claims,
   * because `GAP_LANGUAGE_REGEX` only recognized a fixed set of gap
   * sentence shapes ("hasn't done", "no experience with", ...) and the
   * negation itself sat between the "no"/"hasn't" token and the claim-like
   * verb the (unconditionally checked) `CLAIM_LANGUAGE_REGEX` then matched
   * — e.g. "He has **no recorded experience with** blockchain" contains
   * "he has", and "He **hasn't worked with** SAP" contains "worked".
   */
  it("recognizes 'no recorded experience with' as an honest gap, not a fabricated claim", () => {
    const result = scoreGapHonesty(
      {
        question: "Does he have blockchain experience?",
        answer:
          "He has no recorded experience with blockchain; his nearest grounded work is " +
          "distributed systems [cite:skill:distributed-systems].",
        toolCitations: [{ entityType: "skill", entityId: "distributed-systems" }],
      },
      "gap",
    );

    expect(result.score).toBeGreaterThanOrEqual(0.6);
  });

  it("recognizes 'hasn't worked with' as an honest gap, not a fabricated claim", () => {
    const result = scoreGapHonesty(
      {
        question: "Does he have SAP experience?",
        answer:
          "He hasn't worked with SAP; his nearest grounded work is an ETL migration " +
          "[cite:skill:etl].",
        toolCitations: [{ entityType: "skill", entityId: "etl" }],
      },
      "gap",
    );

    expect(result.score).toBeGreaterThanOrEqual(0.6);
  });

  it("recognizes 'the career records do not contain an account of' as an honest gap", () => {
    const result = scoreGapHonesty(
      {
        question: "Tell me about a time Marcos managed two equally urgent client projects at once.",
        answer:
          "The career records do not contain an account of that; his nearest grounded work is " +
          "prioritization at Xogito [cite:story:xogito-client-account-recovery].",
        toolCitations: [{ entityType: "story", entityId: "xogito-client-account-recovery" }],
      },
      "gap",
    );

    expect(result.score).toBeGreaterThanOrEqual(0.6);
  });
});

describe("scoreGapHonesty — claimed direction (anti-over-refusal)", () => {
  it("scores a grounded, engaged answer to a claimed-skill question high", () => {
    const result = scoreGapHonesty(
      {
        question: "What has he built with TypeScript?",
        answer:
          "He has built production TypeScript systems at House Numbers " +
          "[cite:experience:house-numbers-2022-senior-full-stack-engineer].",
        toolCitations: [
          { entityType: "experience", entityId: "house-numbers-2022-senior-full-stack-engineer" },
        ],
      },
      "claimed",
    );

    expect(result.score).toBeGreaterThanOrEqual(0.8);
  });

  it("scores an over-refusal of a claimed skill low", () => {
    const result = scoreGapHonesty(
      {
        question: "What has he built with TypeScript?",
        answer: "I can't discuss his technical experience.",
        toolCitations: [
          { entityType: "experience", entityId: "house-numbers-2022-senior-full-stack-engineer" },
        ],
      },
      "claimed",
    );

    expect(result.score).toBeLessThan(0.3);
  });
});
