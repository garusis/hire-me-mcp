import type { CareerDataRepository, DomainResult } from "@hire-me-mcp/core";
import * as core from "@hire-me-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withCitationSiteUrls } from "../citation-site-urls.js";
import { createToolExecutor } from "../define-tool.js";
import { listSkillsTool } from "./list-skills.js";

vi.mock("@hire-me-mcp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core")>();
  return { ...actual, listSkills: vi.fn() };
});
vi.mock("../../../src/lib/content/repository", () => ({
  getCareerDataRepository: vi.fn(
    () => ({ getDataset: vi.fn() }) as unknown as CareerDataRepository,
  ),
}));

/** Derived from `core.listSkills`'s return type — see `list-skills.ts` for why. */
type Skill = ReturnType<typeof core.listSkills>["data"][number];

const fixtureSkill: Skill = {
  id: "typescript",
  name: "TypeScript",
  aliases: ["ts"],
  category: "language",
  proficiency: "expert",
  evidence: [{ entityType: "experience", entityId: "fixture-role", label: "Fixture role" }],
};

const fixtureCitations: DomainResult<Skill[]>["citations"] = [
  { entityType: "skill", entityId: "typescript", label: "TypeScript" },
];

describe("listSkillsTool", () => {
  beforeEach(() => {
    vi.mocked(core.listSkills).mockReset();
  });

  it("has a non-empty description and the conventional kebab-case name", () => {
    expect(listSkillsTool.name).toBe("list-skills");
    expect(listSkillsTool.description.length).toBeGreaterThan(0);
  });

  it("with no filters, returns the stubbed domain service's data unmodified (happy path)", async () => {
    vi.mocked(core.listSkills).mockReturnValue({
      data: [fixtureSkill],
      citations: fixtureCitations,
    });
    const executor = createToolExecutor(listSkillsTool);

    const result = await executor({});

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      data: [fixtureSkill],
      citations: withCitationSiteUrls(fixtureCitations),
    });
    expect(vi.mocked(core.listSkills)).toHaveBeenCalledWith(expect.anything(), {});
  });

  it("forwards category and proficiency filters 1:1 to the domain service", async () => {
    vi.mocked(core.listSkills).mockReturnValue({ data: [], citations: [] });
    const executor = createToolExecutor(listSkillsTool);

    await executor({ category: "framework", proficiency: "expert" });

    expect(vi.mocked(core.listSkills)).toHaveBeenCalledWith(expect.anything(), {
      category: "framework",
      proficiency: "expert",
    });
  });

  it("passes an unmatched-filter empty result through as data — never converts it to an error", async () => {
    vi.mocked(core.listSkills).mockReturnValue({ data: [], citations: [] });
    const executor = createToolExecutor(listSkillsTool);

    const result = await executor({ category: "not-a-category" });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ data: [], citations: [] });
  });

  it("passes citations through by deep equality (contract test)", async () => {
    vi.mocked(core.listSkills).mockReturnValue({
      data: [fixtureSkill],
      citations: fixtureCitations,
    });
    const executor = createToolExecutor(listSkillsTool);

    const result = await executor({});

    const structuredContent = result.structuredContent as { citations: unknown };
    expect(structuredContent.citations).toStrictEqual(withCitationSiteUrls(fixtureCitations));
  });

  it("maps an invalid proficiency value to a sanitized invalid_input error", async () => {
    const executor = createToolExecutor(listSkillsTool);

    const result = await executor({ proficiency: "wizard" });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
  });

  it("maps an empty-string category to a sanitized invalid_input error", async () => {
    const executor = createToolExecutor(listSkillsTool);

    const result = await executor({ category: "" });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
  });
});
