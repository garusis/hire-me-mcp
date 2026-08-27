import type { DomainResult } from "@hire-me-mcp/core";
import * as core from "@hire-me-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSkillEvidenceInputSchema, getSkillEvidenceTool } from "./get-skill-evidence.js";

vi.mock("@hire-me-mcp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core")>();
  return { ...actual, getSkillEvidence: vi.fn() };
});

type SkillEvidenceOutcome = ReturnType<typeof core.getSkillEvidence>["data"];

describe("getSkillEvidenceTool", () => {
  beforeEach(() => {
    vi.mocked(core.getSkillEvidence).mockReset();
  });

  it("has the conventional kebab-case id and a non-empty description", () => {
    expect(getSkillEvidenceTool.id).toBe("get-skill-evidence");
    expect(getSkillEvidenceTool.description.length).toBeGreaterThan(0);
  });

  it("delegates to packages/core's getSkillEvidence with the term, returning a claimed DomainResult unmodified", async () => {
    const evidence = [
      { entityType: "project" as const, entityId: "fixture-project", label: "Fixture Project" },
    ];
    const outcome: SkillEvidenceOutcome = {
      kind: "claimed",
      // The embedded skill record carries no `evidence` of its own — the
      // outcome-level `evidence` array is the one canonical copy (#245).
      skill: {
        id: "fixture-skill",
        name: "TypeScript",
        aliases: ["ts"],
        category: "language",
        proficiency: "expert",
      },
      evidence,
    };
    const domainResult: DomainResult<SkillEvidenceOutcome> = {
      data: outcome,
      citations: evidence,
    };
    vi.mocked(core.getSkillEvidence).mockReturnValue(domainResult);

    const result = await getSkillEvidenceTool.execute?.({ term: "TypeScript" }, {} as never);

    expect(core.getSkillEvidence).toHaveBeenCalledTimes(1);
    expect(core.getSkillEvidence).toHaveBeenCalledWith(expect.anything(), "TypeScript");
    expect(result).toEqual(domainResult);
  });

  it("passes through a not-claimed (gap) outcome unmodified — never converted to an error or empty result", async () => {
    const outcome: SkillEvidenceOutcome = {
      kind: "not-claimed",
      gap: {
        id: "fixture-gap",
        name: "Rust",
        aliases: [],
        statement: "Fixture: not claimed.",
        relatedSkills: [],
      },
      relatedSkills: [],
    };
    const domainResult: DomainResult<SkillEvidenceOutcome> = {
      data: outcome,
      citations: [{ entityType: "gap", entityId: "fixture-gap", label: "Rust" }],
    };
    vi.mocked(core.getSkillEvidence).mockReturnValue(domainResult);

    const result = await getSkillEvidenceTool.execute?.({ term: "Rust" }, {} as never);

    expect(result).toEqual(domainResult);
  });

  it("requires a non-empty term", () => {
    expect(getSkillEvidenceInputSchema.safeParse({ term: "" }).success).toBe(false);
  });

  it("rejects a missing term", () => {
    expect(getSkillEvidenceInputSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an oversized term (bounded length security guard)", () => {
    expect(getSkillEvidenceInputSchema.safeParse({ term: "x".repeat(201) }).success).toBe(false);
  });

  it("rejects unexpected extra fields — strict schema", () => {
    expect(
      getSkillEvidenceInputSchema.safeParse({ term: "Rust", unexpected: "field" }).success,
    ).toBe(false);
  });

  it("never calls the core service when input validation fails", () => {
    getSkillEvidenceInputSchema.safeParse({});

    expect(core.getSkillEvidence).not.toHaveBeenCalled();
  });
});
