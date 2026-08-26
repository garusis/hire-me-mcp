import type { CareerDataRepository, DomainResult } from "@hire-me-mcp/core";
import * as core from "@hire-me-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withCitationSiteUrls } from "../citation-site-urls.js";
import { createToolExecutor } from "../define-tool.js";
import { getSkillEvidenceTool } from "./get-skill-evidence.js";

vi.mock("@hire-me-mcp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core")>();
  return { ...actual, getSkillEvidence: vi.fn() };
});
vi.mock("../../../src/lib/content/repository", () => ({
  getCareerDataRepository: vi.fn(
    () => ({ getDataset: vi.fn() }) as unknown as CareerDataRepository,
  ),
}));

/** Derived from `core.getSkillEvidence`'s return type — see `get-skill-evidence.ts` for why. */
type SkillEvidenceOutcome = ReturnType<typeof core.getSkillEvidence>["data"];

describe("getSkillEvidenceTool", () => {
  beforeEach(() => {
    vi.mocked(core.getSkillEvidence).mockReset();
  });

  it("has a non-empty description and the conventional kebab-case name", () => {
    expect(getSkillEvidenceTool.name).toBe("get-skill-evidence");
    expect(getSkillEvidenceTool.description.length).toBeGreaterThan(0);
  });

  it("calls the domain service with the given term and returns a 'claimed' outcome unmodified (happy path)", async () => {
    const evidence = [
      { entityType: "experience" as const, entityId: "fixture-role", label: "Fixture Role" },
    ];
    const claimed: SkillEvidenceOutcome = {
      kind: "claimed",
      // The embedded skill record carries no `evidence` of its own — the
      // outcome-level `evidence` array is the one canonical copy (#245).
      skill: {
        id: "typescript",
        name: "TypeScript",
        aliases: ["ts"],
        category: "language",
        proficiency: "expert",
      },
      evidence,
    };
    const domainResult: DomainResult<SkillEvidenceOutcome> = {
      data: claimed,
      citations: evidence,
    };
    vi.mocked(core.getSkillEvidence).mockReturnValue(domainResult);
    const executor = createToolExecutor(getSkillEvidenceTool);

    const result = await executor({ term: "typescript" });

    expect(core.getSkillEvidence).toHaveBeenCalledWith(expect.anything(), "typescript");
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      data: domainResult.data,
      citations: withCitationSiteUrls(domainResult.citations),
    });
  });

  it("keeps a 'not-claimed' (gap) outcome a SUCCESSFUL result, verbatim — the honesty test", async () => {
    const notClaimed: SkillEvidenceOutcome = {
      kind: "not-claimed",
      gap: {
        id: "golang",
        name: "Go (Golang)",
        aliases: ["go", "golang"],
        statement: "No production Go experience.",
        relatedSkills: [],
      },
      relatedSkills: [],
    };
    vi.mocked(core.getSkillEvidence).mockReturnValue({
      data: notClaimed,
      citations: [{ entityType: "gap", entityId: "golang", label: "Go (Golang)" }],
    });
    const executor = createToolExecutor(getSkillEvidenceTool);

    const result = await executor({ term: "golang" });

    expect(result.isError).toBeUndefined();
    const structuredContent = result.structuredContent as { data: SkillEvidenceOutcome };
    expect(structuredContent.data).toEqual(notClaimed);
    expect(structuredContent.data.kind).toBe("not-claimed");
    if (structuredContent.data.kind === "not-claimed") {
      expect(structuredContent.data.gap.statement).toBe("No production Go experience.");
    }
  });

  it("keeps an 'unknown' outcome a SUCCESSFUL result, not an error or empty result", async () => {
    const unknown: SkillEvidenceOutcome = { kind: "unknown", term: "cobol" };
    vi.mocked(core.getSkillEvidence).mockReturnValue({ data: unknown, citations: [] });
    const executor = createToolExecutor(getSkillEvidenceTool);

    const result = await executor({ term: "cobol" });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ data: unknown, citations: [] });
  });

  it("returns a zero-match ('unknown') result as a successful call for a nonsense term", async () => {
    vi.mocked(core.getSkillEvidence).mockReturnValue({
      data: { kind: "unknown", term: "asdfghjkl" },
      citations: [],
    });
    const executor = createToolExecutor(getSkillEvidenceTool);

    const result = await executor({ term: "asdfghjkl" });

    expect(result.isError).toBeUndefined();
  });

  it("passes citations through by deep equality (contract test)", async () => {
    const citations: DomainResult<SkillEvidenceOutcome>["citations"] = [
      { entityType: "skill", entityId: "typescript", label: "TypeScript" },
    ];
    vi.mocked(core.getSkillEvidence).mockReturnValue({
      data: { kind: "unknown", term: "typescript" },
      citations,
    });
    const executor = createToolExecutor(getSkillEvidenceTool);

    const result = await executor({ term: "typescript" });

    const structuredContent = result.structuredContent as { citations: unknown };
    expect(structuredContent.citations).toStrictEqual(withCitationSiteUrls(citations));
  });

  it("maps invalid input (missing required term) to a sanitized invalid_input error", async () => {
    const executor = createToolExecutor(getSkillEvidenceTool);

    const result = await executor({});

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
  });

  it("maps an empty-string term to a sanitized invalid_input error", async () => {
    const executor = createToolExecutor(getSkillEvidenceTool);

    const result = await executor({ term: "" });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
  });
});
