import { describe, expect, it } from "vitest";
import {
  scoreAnswerAssertions,
  scoreGapHonesty,
  scoreGroundedness,
  scorePreferredSourceCompliance,
  scoreRelevance,
  scoreStoryCompleteness,
  scoreToolRouting,
} from "./index.js";

describe("scorers barrel", () => {
  it("re-exports all three answer-content scorers", () => {
    expect(typeof scoreGroundedness).toBe("function");
    expect(typeof scoreGapHonesty).toBe("function");
    expect(typeof scoreRelevance).toBe("function");
  });

  it("re-exports the tool-routing scorer (#75)", () => {
    expect(typeof scoreToolRouting).toBe("function");
  });

  it("re-exports the answer-assertions scorer (#300 / #295)", () => {
    expect(typeof scoreAnswerAssertions).toBe("function");
  });

  it("re-exports the story-completeness scorer (#295 correction, finding 2)", () => {
    expect(typeof scoreStoryCompleteness).toBe("function");
  });

  it("re-exports the preferred-source compliance scorer (#295 second independent-review correction, finding 4)", () => {
    expect(typeof scorePreferredSourceCompliance).toBe("function");
  });
});
