import type { CareerDataRepository, DomainResult } from "@hire-me-mcp/core";
import * as core from "@hire-me-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createToolExecutor } from "../define-tool.js";
import { listProjectsTool } from "./list-projects.js";

vi.mock("@hire-me-mcp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core")>();
  return { ...actual, listProjects: vi.fn() };
});
vi.mock("../../../src/lib/content/repository", () => ({
  getCareerDataRepository: vi.fn(
    () => ({ getDataset: vi.fn() }) as unknown as CareerDataRepository,
  ),
}));

/** Derived from `core.listProjects`'s return type — see `list-projects.ts` for why. */
type Project = ReturnType<typeof core.listProjects>["data"][number];

const fixtureProject: Project = {
  id: "fixture-project",
  name: "Fixture Project",
  summary: "Fixture summary.",
  role: "Author",
  tech: ["typescript"],
  links: [{ label: "Repo", url: "https://example.test/repo" }],
  body: "Fixture body prose.",
};

const fixtureCitations: DomainResult<Project[]>["citations"] = [
  { entityType: "project", entityId: "fixture-project", label: "Fixture Project" },
];

describe("listProjectsTool", () => {
  beforeEach(() => {
    vi.mocked(core.listProjects).mockReset();
  });

  it("has a non-empty description and the conventional kebab-case name", () => {
    expect(listProjectsTool.name).toBe("list-projects");
    expect(listProjectsTool.description.length).toBeGreaterThan(0);
  });

  it("with no arguments, returns the stubbed domain service's data unmodified (happy path)", async () => {
    vi.mocked(core.listProjects).mockReturnValue({
      data: [fixtureProject],
      citations: fixtureCitations,
    });
    const executor = createToolExecutor(listProjectsTool);

    const result = await executor({});

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      data: [fixtureProject],
      citations: fixtureCitations,
    });
    expect(vi.mocked(core.listProjects)).toHaveBeenCalledWith(expect.anything(), {});
  });

  it("forwards the tags filter 1:1 to the domain service", async () => {
    vi.mocked(core.listProjects).mockReturnValue({ data: [], citations: [] });
    const executor = createToolExecutor(listProjectsTool);

    await executor({ tags: ["postgres", "react"] });

    expect(vi.mocked(core.listProjects)).toHaveBeenCalledWith(expect.anything(), {
      tags: ["postgres", "react"],
    });
  });

  it("passes an unmatched-tags empty result through as data — never converts it to an error", async () => {
    vi.mocked(core.listProjects).mockReturnValue({ data: [], citations: [] });
    const executor = createToolExecutor(listProjectsTool);

    const result = await executor({ tags: ["cobol"] });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ data: [], citations: [] });
  });

  it("passes citations through by deep equality (contract test)", async () => {
    vi.mocked(core.listProjects).mockReturnValue({
      data: [fixtureProject],
      citations: fixtureCitations,
    });
    const executor = createToolExecutor(listProjectsTool);

    const result = await executor({});

    const structuredContent = result.structuredContent as { citations: unknown };
    expect(structuredContent.citations).toStrictEqual(fixtureCitations);
  });

  it("maps a wrong-typed tags value to a sanitized invalid_input error", async () => {
    const executor = createToolExecutor(listProjectsTool);

    const result = await executor({ tags: "typescript" });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
  });

  it("maps an empty-string tag to a sanitized invalid_input error", async () => {
    const executor = createToolExecutor(listProjectsTool);

    const result = await executor({ tags: [""] });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
  });
});
