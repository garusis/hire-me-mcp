import { getSkillEvidence } from "@hire-me-mcp/core";
import { describe, expect, it } from "vitest";
import { getCareerDataRepository } from "./repository";
import { getSkillEvidenceView } from "./skills";

describe("getSkillEvidenceView", () => {
  it("passes a claimed skill outcome through unmodified", () => {
    const expected = getSkillEvidence(getCareerDataRepository(), "typescript");

    const view = getSkillEvidenceView("typescript");

    expect(view.outcome).toEqual(expected.data);
    expect(view.outcome.kind).toBe("claimed");
    expect(view.citations).toEqual(expected.citations);
  });

  it("faithfully surfaces the not-claimed (gap) outcome, including the honest gap statement, unmodified", () => {
    const expected = getSkillEvidence(getCareerDataRepository(), "golang");

    const view = getSkillEvidenceView("golang");

    expect(view.outcome).toEqual(expected.data);
    expect(view.outcome.kind).toBe("not-claimed");
    if (view.outcome.kind === "not-claimed") {
      expect(view.outcome.gap.statement).toBe(
        expected.data.kind === "not-claimed" ? expected.data.gap.statement : undefined,
      );
    }
    expect(view.citations).toEqual(expected.citations);
  });

  it("returns the unknown outcome for a term matching neither a claimed skill nor a recorded gap", () => {
    const view = getSkillEvidenceView("some-term-nobody-authored");

    expect(view.outcome).toEqual({ kind: "unknown", term: "some-term-nobody-authored" });
    expect(view.citations).toEqual([]);
  });
});
