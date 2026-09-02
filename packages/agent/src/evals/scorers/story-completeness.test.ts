import { describe, expect, it } from "vitest";
import { scoreStoryCompleteness } from "./story-completeness.js";

/**
 * #295 correction (independent Codex review, agent package `1dd7ac7`,
 * finding 2): #295 requires "an agent assertion that answers include
 * grounded situation, actions, and results rather than only adjectives or
 * testimonials" and "a story-completeness scorer... resilient to prose
 * formatting: it should score factual coverage of the returned
 * situation/actions/results, not require literal STAR headings." These
 * tests prove both halves: a fluid-prose complete answer scores fully with
 * no headings, and an adjective/testimonial-only answer — the exact
 * regression #295 flags — scores low.
 */
describe("scoreStoryCompleteness", () => {
  it("scores 1 for a complete situation/action/result answer written as fluid prose, with no STAR headings", () => {
    const result = scoreStoryCompleteness({
      answer:
        "When the client relationship soured after a missed deadline, Marcos rebuilt trust by " +
        "personally taking over delivery and renegotiating priorities with the client. As a " +
        "result, the account was retained and the client later commissioned further work.",
    });
    expect(result.score).toBe(1);
  });

  it("scores low for an adjective/testimonial-only answer with no concrete situation, action, or result — the exact regression #295 flags", () => {
    const result = scoreStoryCompleteness({
      answer:
        "Marcos is an incredibly dedicated, thoughtful, and skilled engineer who everyone " +
        "genuinely loves working with and deeply respects.",
    });
    expect(result.score).toBeLessThanOrEqual(1 / 3);
    expect(result.reason).toMatch(/situation|action|result/i);
  });

  it("scores 2/3 when the answer names an action and a result but never sets up the situation/context", () => {
    const result = scoreStoryCompleteness({
      answer: "He rebuilt the client relationship, which restored the account.",
    });
    expect(result.score).toBeCloseTo(2 / 3, 4);
  });

  it("scores 1/3 when the answer only sets up the situation with no described action or stated result", () => {
    const result = scoreStoryCompleteness({
      answer: "When the client relationship soured after a missed deadline, it was a hard time.",
    });
    expect(result.score).toBeCloseTo(1 / 3, 4);
  });
});
