import { describe, expect, it } from "vitest";
import { scoreAnswerAssertions } from "./answer-assertions.js";

describe("scoreAnswerAssertions", () => {
  it("scores 1 when every mustMatch pattern is present and no mustNotMatch pattern appears", () => {
    const result = scoreAnswerAssertions(
      "The document-extraction work was a proof of concept; production kept the vendor.",
      { mustMatch: ["proof of concept"], mustNotMatch: ["30%\\s*to\\s*87%"] },
    );
    expect(result.score).toBe(1);
    expect(result.reason).toMatch(/2\/2/);
  });

  it("matches case-insensitively", () => {
    const result = scoreAnswerAssertions("It was a PROOF OF CONCEPT.", {
      mustMatch: ["proof of concept"],
    });
    expect(result.score).toBe(1);
  });

  it("scores the fraction of assertions that passed and names the failures", () => {
    const result = scoreAnswerAssertions(
      "Accuracy went from 30% to 87% and it replaced the vendor at 3% of its cost.",
      {
        mustMatch: ["proof of concept"],
        mustNotMatch: ["30%\\s*to\\s*87%", "3% of (?:its|the vendor's) cost"],
      },
    );
    expect(result.score).toBe(0);
    expect(result.reason).toMatch(/missing required pattern/i);
    expect(result.reason).toMatch(/forbidden pattern matched/i);
  });

  it("counts a partially satisfied assertion set proportionally", () => {
    const result = scoreAnswerAssertions("It was a proof of concept that beat the vendor.", {
      mustMatch: ["proof of concept"],
      mustNotMatch: ["beat the vendor"],
    });
    expect(result.score).toBe(0.5);
  });
});
