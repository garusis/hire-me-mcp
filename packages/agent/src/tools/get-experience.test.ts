import type { DomainResult, ExperienceFilter } from "@hire-me-mcp/core";
import * as core from "@hire-me-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getExperienceInputSchema, getExperienceTool } from "./get-experience.js";

vi.mock("@hire-me-mcp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core")>();
  return { ...actual, getExperience: vi.fn() };
});

type ExperienceEntry = ReturnType<typeof core.getExperience>["data"][number];

const fixtureEntry: ExperienceEntry = {
  id: "fixture-role",
  company: "Fixture Co",
  role: "Fixture Engineer",
  startDate: "2022-01",
  endDate: undefined,
  tech: ["typescript"],
  summary: "Fixture summary.",
  highlights: ["Did fixture things."],
};

describe("getExperienceTool", () => {
  beforeEach(() => {
    vi.mocked(core.getExperience).mockReset();
  });

  it("has the conventional kebab-case id and a non-empty description", () => {
    expect(getExperienceTool.id).toBe("get-experience");
    expect(getExperienceTool.description.length).toBeGreaterThan(0);
  });

  it("delegates to packages/core's getExperience with the parsed filter, returning the DomainResult unmodified", async () => {
    const domainResult: DomainResult<ExperienceEntry[]> = {
      data: [fixtureEntry],
      citations: [{ entityType: "experience", entityId: "fixture-role", label: "Fixture Co" }],
    };
    vi.mocked(core.getExperience).mockReturnValue(domainResult);
    const filter: ExperienceFilter = { company: "Fixture Co", status: "current" };

    const result = await getExperienceTool.execute?.(filter, {} as never);

    expect(core.getExperience).toHaveBeenCalledTimes(1);
    expect(core.getExperience).toHaveBeenCalledWith(expect.anything(), filter);
    expect(result).toEqual(domainResult);
  });

  it("accepts an empty filter (no constraints)", () => {
    expect(getExperienceInputSchema.safeParse({}).success).toBe(true);
  });

  it("rejects a malformed date (not YYYY-MM)", () => {
    expect(getExperienceInputSchema.safeParse({ from: "2022" }).success).toBe(false);
  });

  it("rejects a status outside the current/past enum", () => {
    expect(getExperienceInputSchema.safeParse({ status: "future" }).success).toBe(false);
  });

  it("rejects an oversized company name (bounded length security guard)", () => {
    expect(getExperienceInputSchema.safeParse({ company: "x".repeat(201) }).success).toBe(false);
  });

  it("rejects unexpected extra fields — strict schema", () => {
    expect(getExperienceInputSchema.safeParse({ unexpected: "field" }).success).toBe(false);
  });

  it("never calls the core service when input validation fails", () => {
    getExperienceInputSchema.safeParse({ status: "future" });

    expect(core.getExperience).not.toHaveBeenCalled();
  });
});
