import type { CareerDataRepository, DomainResult } from "@hire-me-mcp/core";
import * as core from "@hire-me-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withCitationSiteUrls } from "../citation-site-urls.js";
import { createToolExecutor } from "../define-tool.js";
import { listEducationTool } from "./list-education.js";

vi.mock("@hire-me-mcp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core")>();
  return { ...actual, listEducation: vi.fn() };
});
vi.mock("../../../src/lib/content/repository", () => ({
  getCareerDataRepository: vi.fn(
    () => ({ getDataset: vi.fn() }) as unknown as CareerDataRepository,
  ),
}));

/** Derived from `core.listEducation`'s return type — see `list-education.ts` for why. */
type EducationEntry = ReturnType<typeof core.listEducation>["data"][number];

const fixtureEntries: EducationEntry[] = [
  {
    id: "in-progress-degree",
    institution: "Fixture University",
    credential: "B.S. Fixtureology (in progress)",
  },
  {
    id: "fixture-cert",
    institution: "Fixture Institute",
    credential: "Fixture Certification",
    startDate: "2020-01",
    endDate: "2020-01",
  },
];

const fixtureCitations: DomainResult<EducationEntry[]>["citations"] = [
  {
    entityType: "education",
    entityId: "in-progress-degree",
    label: "B.S. Fixtureology (in progress), Fixture University",
  },
  {
    entityType: "education",
    entityId: "fixture-cert",
    label: "Fixture Certification, Fixture Institute",
  },
];

describe("listEducationTool", () => {
  beforeEach(() => {
    vi.mocked(core.listEducation).mockReset();
  });

  it("has a non-empty description and the conventional kebab-case name", () => {
    expect(listEducationTool.name).toBe("list-education");
    expect(listEducationTool.description.length).toBeGreaterThan(0);
  });

  it("accepts no arguments and returns the stubbed domain service's data unmodified (happy path)", async () => {
    vi.mocked(core.listEducation).mockReturnValue({
      data: fixtureEntries,
      citations: fixtureCitations,
    });
    const executor = createToolExecutor(listEducationTool);

    const result = await executor({});

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      data: fixtureEntries,
      citations: withCitationSiteUrls(fixtureCitations),
    });
  });

  it("passes citations through by deep equality (contract test)", async () => {
    vi.mocked(core.listEducation).mockReturnValue({
      data: fixtureEntries,
      citations: fixtureCitations,
    });
    const executor = createToolExecutor(listEducationTool);

    const result = await executor({});

    const structuredContent = result.structuredContent as { citations: unknown };
    expect(structuredContent.citations).toStrictEqual(withCitationSiteUrls(fixtureCitations));
  });

  it("passes an empty result through as data — never converts it to an error", async () => {
    vi.mocked(core.listEducation).mockReturnValue({ data: [], citations: [] });
    const executor = createToolExecutor(listEducationTool);

    const result = await executor({});

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ data: [], citations: [] });
  });

  it("maps invalid input (non-object arguments) to a sanitized invalid_input error", async () => {
    const executor = createToolExecutor(listEducationTool);

    const result = await executor("not an object");

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
  });

  it("declares a human-readable title and an outputSchema for its structuredContent (#241, #242)", () => {
    expect(listEducationTool.title).toBeTruthy();
    expect(listEducationTool.outputSchema).toBeDefined();
  });
});
