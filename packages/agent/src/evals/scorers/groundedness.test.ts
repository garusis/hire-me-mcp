import { describe, expect, it } from "vitest";
import { scoreGroundedness } from "./groundedness.js";

describe("scoreGroundedness", () => {
  it("scores a fully cited, tool-backed answer high", () => {
    const result = scoreGroundedness({
      question: "What has he built with AWS?",
      answer:
        "He built production LLM pipelines at House Numbers using AWS Lambda " +
        "[cite:experience:house-numbers-2022-senior-full-stack-engineer]. He used AWS for " +
        "serverless deployments there [cite:skill:aws].",
      toolCitations: [
        { entityType: "experience", entityId: "house-numbers-2022-senior-full-stack-engineer" },
        { entityType: "skill", entityId: "aws" },
      ],
    });

    expect(result.score).toBeGreaterThanOrEqual(0.9);
    expect(result.reason).toMatch(/2\/2/);
  });

  it("scores an uncited factual claim low even with no fabricated markers", () => {
    const result = scoreGroundedness({
      question: "What has he built with Java?",
      answer:
        "He led a team of ten engineers architecting Java microservices for a fintech client.",
      toolCitations: [
        { entityType: "experience", entityId: "house-numbers-2022-senior-full-stack-engineer" },
      ],
    });

    expect(result.score).toBeLessThan(0.5);
  });

  it("scores a citation pointing at a tool result that was never returned low", () => {
    const result = scoreGroundedness({
      question: "What has he built with Rust?",
      answer:
        "He led backend architecture for a fintech client using Rust " +
        "[cite:experience:fabricated-entity-never-returned].",
      toolCitations: [],
    });

    expect(result.score).toBeLessThan(0.3);
    expect(result.reason).toMatch(/0\/1/);
  });

  it("does not penalize an honest gap statement for lacking a factual citation marker", () => {
    const result = scoreGroundedness({
      question: "Does he have production Rust experience?",
      answer:
        "He hasn't done production Rust work; the closest evidence is his TypeScript depth " +
        "[cite:skill:typescript].",
      toolCitations: [{ entityType: "skill", entityId: "typescript" }],
    });

    expect(result.score).toBeGreaterThanOrEqual(0.9);
  });
});
