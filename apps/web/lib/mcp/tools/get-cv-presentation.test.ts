import type { CareerDataRepository, DomainResult, GetCvPresentationData } from "@hire-me-mcp/core";
import * as core from "@hire-me-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withCitationSiteUrls } from "../citation-site-urls.js";
import { createToolExecutor } from "../define-tool.js";
import { getCvPresentationTool } from "./get-cv-presentation.js";

vi.mock("@hire-me-mcp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core")>();
  return { ...actual, getCvPresentation: vi.fn() };
});
vi.mock("../../../src/lib/content/repository", () => ({
  getCareerDataRepository: vi.fn(
    () => ({ getDataset: vi.fn() }) as unknown as CareerDataRepository,
  ),
}));

const fixtureData: GetCvPresentationData = {
  variant: "general",
  headline: "Fixture Headline",
  summary: "Fixture summary.",
  experience: [
    {
      id: "fixture-role",
      company: "Fixture Co",
      role: "Fixture Engineer",
      startDate: "2020-01",
      endDate: undefined,
      bullets: ["Did a fixture thing"],
      tech: ["TypeScript"],
      displayLine: "Fixture Engineer, Fixture Co (Jan 2020 – Present)",
    },
  ],
  projects: [
    {
      id: "fixture-project",
      name: "Fixture Project",
      role: "Maintainer",
      summary: "Fixture project summary.",
      links: [{ label: "GitHub", url: "https://github.com/fixture/project" }],
    },
  ],
  skillGroups: [
    {
      category: "language",
      label: "language",
      skills: [{ id: "fixture-skill", name: "Fixture Skill" }],
    },
  ],
  education: [
    {
      id: "fixture-education",
      institution: "Fixture University",
      credential: "Fixture Degree",
    },
  ],
};

const fixtureCitations: DomainResult<GetCvPresentationData>["citations"] = [
  {
    entityType: "profile",
    entityId: "fixture-profile",
    label: "Fixture Person",
    fragment: "headline",
  },
  {
    entityType: "profile",
    entityId: "fixture-profile",
    label: "Fixture Person",
    fragment: "summary",
  },
  {
    entityType: "experience",
    entityId: "fixture-role",
    label: "Fixture Engineer, Fixture Co",
    fragment: "bullets",
  },
  {
    entityType: "project",
    entityId: "fixture-project",
    label: "Fixture Project",
    fragment: "summary",
  },
  { entityType: "skill", entityId: "fixture-skill", label: "Fixture Skill" },
  {
    entityType: "education",
    entityId: "fixture-education",
    label: "Fixture Degree, Fixture University",
  },
];

describe("getCvPresentationTool", () => {
  beforeEach(() => {
    vi.mocked(core.getCvPresentation).mockReset();
  });

  it("has a non-empty description and the conventional kebab-case name", () => {
    expect(getCvPresentationTool.name).toBe("get-cv-presentation");
    expect(getCvPresentationTool.description.length).toBeGreaterThan(0);
  });

  it("defaults to the general variant when called with no arguments", async () => {
    vi.mocked(core.getCvPresentation).mockReturnValue({
      data: fixtureData,
      citations: fixtureCitations,
    });
    const executor = createToolExecutor(getCvPresentationTool);

    const result = await executor({});

    expect(result.isError).toBeUndefined();
    expect(core.getCvPresentation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ variant: undefined }),
    );
    expect(result.structuredContent).toEqual({
      data: fixtureData,
      citations: withCitationSiteUrls(fixtureCitations),
    });
  });

  it("passes an explicit ai variant through to the domain service", async () => {
    vi.mocked(core.getCvPresentation).mockReturnValue({
      data: { ...fixtureData, variant: "ai" },
      citations: fixtureCitations,
    });
    const executor = createToolExecutor(getCvPresentationTool);

    const result = await executor({ variant: "ai" });

    expect(result.isError).toBeUndefined();
    expect(core.getCvPresentation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ variant: "ai" }),
    );
    const structuredContent = result.structuredContent as { data: { variant: string } };
    expect(structuredContent.data.variant).toBe("ai");
  });

  it("rejects an unknown variant value as a documented, self-correcting invalid_input error", async () => {
    const executor = createToolExecutor(getCvPresentationTool);

    const result = await executor({ variant: "spanish" });

    expect(result.isError).toBe(true);
    const structuredContent = result.structuredContent as { code: string; message: string };
    expect(structuredContent.code).toBe("invalid_input");
    expect(structuredContent.message).toContain('"general"');
    expect(structuredContent.message).toContain('"ai"');
  });

  it("passes citations through by deep equality (contract test)", async () => {
    vi.mocked(core.getCvPresentation).mockReturnValue({
      data: fixtureData,
      citations: fixtureCitations,
    });
    const executor = createToolExecutor(getCvPresentationTool);

    const result = await executor({});

    const structuredContent = result.structuredContent as { citations: unknown };
    expect(structuredContent.citations).toStrictEqual(withCitationSiteUrls(fixtureCitations));
  });

  it("maps invalid input (non-object arguments) to a sanitized invalid_input error", async () => {
    const executor = createToolExecutor(getCvPresentationTool);

    const result = await executor("not an object");

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
  });

  it("declares a human-readable title and an outputSchema for its structuredContent (#241, #242)", () => {
    expect(getCvPresentationTool.title).toBeTruthy();
    expect(getCvPresentationTool.outputSchema).toBeDefined();
  });
});
