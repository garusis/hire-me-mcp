import { describe, expect, expectTypeOf, it } from "vitest";
import type { Citation, DomainResult } from "./result.js";
import { createDomainResult } from "./result.js";

describe("createDomainResult", () => {
  it("carries a data payload alongside a citations array", () => {
    const result = createDomainResult({ headline: "Senior Engineer" }, [
      { entityType: "profile", entityId: "profile-fixture", label: "Fixture Person" },
    ]);

    expect(result).toEqual({
      data: { headline: "Senior Engineer" },
      citations: [{ entityType: "profile", entityId: "profile-fixture", label: "Fixture Person" }],
    });
  });

  it("allows an empty citations array (no evidence-backed claim yet)", () => {
    const result = createDomainResult(null, []);
    expect(result).toEqual({ data: null, citations: [] });
  });

  it("types data as whatever the generic parameter says", () => {
    expectTypeOf<DomainResult<number>["data"]>().toEqualTypeOf<number>();
    expectTypeOf<DomainResult<number>["citations"]>().toEqualTypeOf<Citation[]>();
  });

  it("re-exports Citation with the shape defined by packages/career-data", () => {
    const citation: Citation = {
      entityType: "skill",
      entityId: "fixture-skill",
      label: "Fixture Skill",
      fragment: "evidence.0",
    };
    expect(citation.entityType).toBe("skill");
  });
});
