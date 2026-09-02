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

  /**
   * #294 independent-review correction (findings 2-4): `mustCiteEntity` /
   * `mustNotCiteEntity` check the run's actual returned citations
   * (`toolCitations`, the same field `EvalTranscript` and the groundedness
   * scorer already use), not the answer's wording — so a run that cites the
   * WRONG entity while using the right vocabulary is caught, and one that
   * never actually fetched the required evidence is caught even if the
   * answer text happens to mention it.
   */
  describe("mustCiteEntity / mustNotCiteEntity (#294 independent-review correction)", () => {
    it("scores 1 when a required citation is present in toolCitations", () => {
      const result = scoreAnswerAssertions(
        "He rebuilt client trust at Xogito.",
        { mustCiteEntity: [{ entityType: "story", entityId: "xogito-client-account-recovery" }] },
        [{ entityType: "story", entityId: "xogito-client-account-recovery" }],
      );
      expect(result.score).toBe(1);
    });

    it("scores 0 when a required citation is absent from toolCitations, even if the answer mentions it by name", () => {
      const result = scoreAnswerAssertions(
        "He rebuilt client trust at Xogito.",
        { mustCiteEntity: [{ entityType: "story", entityId: "xogito-client-account-recovery" }] },
        [{ entityType: "recommendation", entityId: "some-other-rec" }],
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/missing required citation/i);
    });

    it("defaults toolCitations to empty when omitted (backward compatible), failing any mustCiteEntity", () => {
      const result = scoreAnswerAssertions("He rebuilt client trust at Xogito.", {
        mustCiteEntity: [{ entityType: "story", entityId: "xogito-client-account-recovery" }],
      });
      expect(result.score).toBe(0);
    });

    it("scores 0 when a forbidden citation IS present in toolCitations", () => {
      const result = scoreAnswerAssertions(
        "He showed leadership without formal authority.",
        { mustNotCiteEntity: [{ entityType: "story", entityId: "mutual-informal-leadership" }] },
        [{ entityType: "story", entityId: "mutual-informal-leadership" }],
      );
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/forbidden citation present/i);
    });

    it("scores 1 when a forbidden citation is absent from toolCitations", () => {
      const result = scoreAnswerAssertions(
        "He showed leadership without formal authority.",
        { mustNotCiteEntity: [{ entityType: "story", entityId: "mutual-informal-leadership" }] },
        [{ entityType: "story", entityId: "xogito-client-account-recovery" }],
      );
      expect(result.score).toBe(1);
    });

    it("combines with mustMatch/mustNotMatch proportionally", () => {
      const result = scoreAnswerAssertions(
        "He rebuilt client trust at Xogito.",
        {
          mustMatch: ["Xogito"],
          mustCiteEntity: [{ entityType: "story", entityId: "xogito-client-account-recovery" }],
        },
        [],
      );
      expect(result.score).toBe(0.5);
    });
  });
});
