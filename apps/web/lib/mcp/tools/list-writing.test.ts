import type { CareerDataRepository, DomainResult } from "@hire-me-mcp/core";
import * as core from "@hire-me-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withCitationSiteUrls } from "../citation-site-urls.js";
import { createToolExecutor } from "../define-tool.js";
import { listWritingTool } from "./list-writing.js";

vi.mock("@hire-me-mcp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core")>();
  return { ...actual, listWriting: vi.fn() };
});
vi.mock("../../../src/lib/content/repository", () => ({
  getCareerDataRepository: vi.fn(
    () => ({ getDataset: vi.fn() }) as unknown as CareerDataRepository,
  ),
}));

/** Derived from `core.listWriting`'s return type — see `list-writing.ts` for why. */
type WritingEntry = ReturnType<typeof core.listWriting>["data"][number];

const fixtureEntry: WritingEntry = {
  id: "fixture-piece",
  title: "Fixture Piece",
  publishedDate: "2024-02-01",
  summary: "Fixture summary.",
  url: "https://example.test/fixture-piece",
  body: "Fixture body prose.",
};

const fixtureCitations: DomainResult<WritingEntry[]>["citations"] = [
  { entityType: "writing", entityId: "fixture-piece", label: "Fixture Piece" },
];

describe("listWritingTool", () => {
  beforeEach(() => {
    vi.mocked(core.listWriting).mockReset();
  });

  it("has a non-empty description and the conventional kebab-case name", () => {
    expect(listWritingTool.name).toBe("list-writing");
    expect(listWritingTool.description.length).toBeGreaterThan(0);
  });

  it("accepts no arguments and returns the stubbed domain service's data unmodified (happy path)", async () => {
    vi.mocked(core.listWriting).mockReturnValue({
      data: [fixtureEntry],
      citations: fixtureCitations,
    });
    const executor = createToolExecutor(listWritingTool);

    const result = await executor({});

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      data: [fixtureEntry],
      citations: withCitationSiteUrls(fixtureCitations),
    });
  });

  it("passes the honest empty-corpus result through as data — never converts it to an error", async () => {
    vi.mocked(core.listWriting).mockReturnValue({ data: [], citations: [] });
    const executor = createToolExecutor(listWritingTool);

    const result = await executor({});

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ data: [], citations: [] });
  });

  it("passes citations through by deep equality (contract test)", async () => {
    vi.mocked(core.listWriting).mockReturnValue({
      data: [fixtureEntry],
      citations: fixtureCitations,
    });
    const executor = createToolExecutor(listWritingTool);

    const result = await executor({});

    const structuredContent = result.structuredContent as { citations: unknown };
    expect(structuredContent.citations).toStrictEqual(withCitationSiteUrls(fixtureCitations));
  });

  it("maps invalid input (non-object arguments) to a sanitized invalid_input error", async () => {
    const executor = createToolExecutor(listWritingTool);

    const result = await executor([]);

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
  });

  it("declares a human-readable title and an outputSchema for its structuredContent (#241, #242)", () => {
    expect(listWritingTool.title).toBeTruthy();
    expect(listWritingTool.outputSchema).toBeDefined();
  });
});
