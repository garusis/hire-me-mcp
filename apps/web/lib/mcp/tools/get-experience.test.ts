import type { CareerDataRepository, DomainResult } from "@hire-me-mcp/core";
import * as core from "@hire-me-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createToolExecutor } from "../define-tool.js";
import { getExperienceTool } from "./get-experience.js";

vi.mock("@hire-me-mcp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core")>();
  return { ...actual, getExperience: vi.fn() };
});
vi.mock("../../../src/lib/content/repository", () => ({
  getCareerDataRepository: vi.fn(
    () => ({ getDataset: vi.fn() }) as unknown as CareerDataRepository,
  ),
}));

/** Derived from `core.getExperience`'s return type — see `get-experience.ts` for why. */
type ExperienceEntry = ReturnType<typeof core.getExperience>["data"][number];

function entry(overrides: Partial<ExperienceEntry> & Pick<ExperienceEntry, "id">): ExperienceEntry {
  return {
    role: "Fixture Role",
    company: "Fixture Co",
    startDate: "2020-01",
    summary: "Fixture summary.",
    highlights: ["Fixture highlight."],
    tech: ["typescript"],
    ...overrides,
  };
}

const currentEntry = entry({ id: "role-current", company: "Current Co" });
const pastEntry = entry({ id: "role-past", company: "Past Co", endDate: "2021-12" });

describe("getExperienceTool", () => {
  beforeEach(() => {
    vi.mocked(core.getExperience).mockReset();
  });

  it("has a non-empty description and the conventional kebab-case name", () => {
    expect(getExperienceTool.name).toBe("get-experience");
    expect(getExperienceTool.description.length).toBeGreaterThan(0);
  });

  it("with no arguments, calls the domain service with an empty filter and returns the full history", async () => {
    const domainResult: DomainResult<ExperienceEntry[]> = {
      data: [currentEntry, pastEntry],
      citations: [
        { entityType: "experience", entityId: "role-current", label: "Fixture Role, Current Co" },
        { entityType: "experience", entityId: "role-past", label: "Fixture Role, Past Co" },
      ],
    };
    vi.mocked(core.getExperience).mockReturnValue(domainResult);
    const executor = createToolExecutor(getExperienceTool);

    const result = await executor({});

    expect(core.getExperience).toHaveBeenCalledWith(expect.anything(), {});
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      data: domainResult.data,
      citations: domainResult.citations,
    });
  });

  it.each([
    ["company", { company: "Current Co" }],
    ["tech", { tech: ["typescript"] }],
    ["from", { from: "2020-01" }],
    ["to", { to: "2021-12" }],
    ["status", { status: "current" as const }],
  ])(
    "maps the %s filter dimension 1:1 onto the domain service's filter",
    async (_label, filter) => {
      const domainResult: DomainResult<ExperienceEntry[]> = { data: [currentEntry], citations: [] };
      vi.mocked(core.getExperience).mockReturnValue(domainResult);
      const executor = createToolExecutor(getExperienceTool);

      const result = await executor(filter);

      expect(core.getExperience).toHaveBeenCalledWith(expect.anything(), filter);
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({ data: domainResult.data, citations: [] });
    },
  );

  it("returns a SUCCESSFUL empty-list result when the domain service reports no match, not an error", async () => {
    vi.mocked(core.getExperience).mockReturnValue({ data: [], citations: [] });
    const executor = createToolExecutor(getExperienceTool);

    const result = await executor({ company: "Nonexistent Co" });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ data: [], citations: [] });
  });

  it("passes citations through by deep equality (contract test)", async () => {
    const citations: DomainResult<ExperienceEntry[]>["citations"] = [
      { entityType: "experience", entityId: "role-current", label: "Fixture Role, Current Co" },
    ];
    vi.mocked(core.getExperience).mockReturnValue({ data: [currentEntry], citations });
    const executor = createToolExecutor(getExperienceTool);

    const result = await executor({});

    const structuredContent = result.structuredContent as { citations: unknown };
    expect(structuredContent.citations).toStrictEqual(citations);
  });

  it("passes an unusual/arbitrary domain payload through unmodified — no reshaping of handler output", async () => {
    const unusualPayload = [{ ...currentEntry, summary: "gap-shaped edge value" }];
    vi.mocked(core.getExperience).mockReturnValue({ data: unusualPayload, citations: [] });
    const executor = createToolExecutor(getExperienceTool);

    const result = await executor({});

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ data: unusualPayload, citations: [] });
  });

  it("maps an invalid status enum value to a sanitized invalid_input error", async () => {
    const executor = createToolExecutor(getExperienceTool);

    const result = await executor({ status: "bogus" });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
  });

  it("maps a malformed date (wrong type) to a sanitized invalid_input error", async () => {
    const executor = createToolExecutor(getExperienceTool);

    const result = await executor({ from: 2020 });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
  });
});
