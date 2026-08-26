import type { SearchCareerResult } from "@hire-me-mcp/core/search-career";
import {
  MAX_QUERY_LENGTH,
  MAX_TOP_K,
  MIN_TOP_K,
  RELEVANCE_FLOOR,
} from "@hire-me-mcp/core/search-career";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createToolExecutor } from "../define-tool.js";
import { getSearchCareer } from "../search-career-instance.js";
import { searchCareerTool } from "./search-career.js";

vi.mock("../search-career-instance.js", () => ({ getSearchCareer: vi.fn() }));

function fixtureResult(overrides: Partial<SearchCareerResult> = {}): SearchCareerResult {
  return {
    query: "event-driven architecture experience",
    results: [
      {
        text: "Led migration of the order pipeline to an event-driven architecture using Kafka.",
        score: 0.87,
        citation: {
          entityType: "experience",
          entityId: "acme-staff-engineer",
          label: "Staff Engineer at Acme (2021–2023)",
          url: "https://example.com/experience/acme",
        },
        sourceType: "experience",
        sourceId: "acme-staff-engineer",
        chunkIndex: 0,
      },
    ],
    tookMs: 42,
    ...overrides,
  };
}

describe("searchCareerTool", () => {
  const fakeSearchCareer = vi.fn();

  beforeEach(() => {
    vi.mocked(getSearchCareer).mockReturnValue(fakeSearchCareer);
    fakeSearchCareer.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("has a non-empty description and the conventional kebab-case name", () => {
    expect(searchCareerTool.name).toBe("search-career");
    expect(searchCareerTool.description.length).toBeGreaterThan(0);
  });

  it("names the deterministic tools to prefer for exact/structured questions in its description", () => {
    const description = searchCareerTool.description;
    expect(description).toContain("get-profile");
    expect(description).toContain("get-experience");
    expect(description).toContain("search-projects");
    expect(description).toContain("get-skill-evidence");
  });

  it("calls searchCareer with the trimmed query and passes topK/sourceTypes through, raising a below-floor minScore up to the relevance floor", async () => {
    fakeSearchCareer.mockResolvedValue(fixtureResult());
    const executor = createToolExecutor(searchCareerTool);

    await executor({
      query: "event-driven architecture experience",
      topK: 5,
      minScore: 0.5,
      sourceTypes: ["experience", "project"],
    });

    expect(fakeSearchCareer).toHaveBeenCalledWith("event-driven architecture experience", {
      topK: 5,
      minScore: RELEVANCE_FLOOR,
      sourceTypes: ["experience", "project"],
    });
  });

  it("applies the relevance floor as the effective minScore when minScore is omitted (#237)", async () => {
    fakeSearchCareer.mockResolvedValue(fixtureResult());
    const executor = createToolExecutor(searchCareerTool);

    await executor({ query: "underwater basket weaving" });

    expect(fakeSearchCareer).toHaveBeenCalledWith("underwater basket weaving", {
      topK: undefined,
      minScore: RELEVANCE_FLOOR,
      sourceTypes: undefined,
    });
  });

  it("passes an above-floor minScore through unchanged", async () => {
    fakeSearchCareer.mockResolvedValue(fixtureResult());
    const executor = createToolExecutor(searchCareerTool);

    await executor({ query: "event-driven architecture", minScore: 0.8 });

    expect(fakeSearchCareer).toHaveBeenCalledWith("event-driven architecture", {
      topK: undefined,
      minScore: 0.8,
      sourceTypes: undefined,
    });
  });

  it("documents the relevance floor in the minScore parameter description", () => {
    const minScoreDescription = (
      searchCareerTool.inputSchema.shape as { minScore: { description?: string } }
    ).minScore.description;
    expect(minScoreDescription).toContain(String(RELEVANCE_FLOOR));
  });

  it("maps an unknown sourceTypes value to invalid_input naming the allowed source types, without calling searchCareer (#238)", async () => {
    const executor = createToolExecutor(searchCareerTool);

    const result = await executor({ query: "kubernetes", sourceTypes: ["blogpost"] });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
    const message = (result.structuredContent as { message: string }).message;
    expect(message).toContain("sourceTypes");
    expect(message).toContain("experience");
    expect(message).toContain("project");
    expect(fakeSearchCareer).not.toHaveBeenCalled();
  });

  it("accepts every chunked source type in sourceTypes", async () => {
    fakeSearchCareer.mockResolvedValue(fixtureResult());
    const executor = createToolExecutor(searchCareerTool);

    const result = await executor({
      query: "kubernetes",
      sourceTypes: ["profile", "experience", "project", "skill", "gap", "education", "writing"],
    });

    expect(result.isError).toBeUndefined();
    expect(fakeSearchCareer).toHaveBeenCalled();
  });

  it("has no duplicated copy/paste clause in its description (#240)", () => {
    const occurrences =
      searchCareerTool.description.split("more expensive per call (it embeds the query)").length -
      1;
    expect(occurrences).toBe(1);
  });

  it("returns a found:true result with ranked hits, each carrying score and a human-readable citation", async () => {
    fakeSearchCareer.mockResolvedValue(fixtureResult());
    const executor = createToolExecutor(searchCareerTool);

    const result = await executor({ query: "event-driven architecture experience" });

    expect(result.isError).toBeUndefined();
    const structuredContent = result.structuredContent as {
      data: { found: boolean; results?: unknown[] };
      citations: unknown[];
    };
    expect(structuredContent.data.found).toBe(true);
    expect(structuredContent.data.results).toEqual([
      {
        text: "Led migration of the order pipeline to an event-driven architecture using Kafka.",
        score: 0.87,
        sourceType: "experience",
        sourceId: "acme-staff-engineer",
        citation: "Staff Engineer at Acme (2021–2023)",
        citationUrl: "https://example.com/experience/acme",
      },
    ]);
    expect(structuredContent.citations).toEqual([
      {
        entityType: "experience",
        entityId: "acme-staff-engineer",
        label: "Staff Engineer at Acme (2021–2023)",
        url: "https://example.com/experience/acme",
      },
    ]);
  });

  it("falls back to the canonical site page as citationUrl for a hit whose citation has no external url (#247)", async () => {
    fakeSearchCareer.mockResolvedValue(
      fixtureResult({
        results: [
          {
            text: "Built a CI/CD pipeline.",
            score: 0.7,
            citation: { entityType: "project", entityId: "ci-pipeline", label: "CI Pipeline" },
            sourceType: "project",
            sourceId: "ci-pipeline",
            chunkIndex: 0,
          },
        ],
      }),
    );
    const executor = createToolExecutor(searchCareerTool);

    const result = await executor({ query: "CI/CD" });

    const structuredContent = result.structuredContent as {
      data: { results?: Array<{ citationUrl?: string }> };
    };
    expect(structuredContent.data.results?.[0]?.citationUrl).toBe(
      "http://localhost:3000/projects/ci-pipeline",
    );
  });

  it("returns an explicit found:false 'no relevant content found' result for an empty match set, not an empty blob", async () => {
    fakeSearchCareer.mockResolvedValue(fixtureResult({ results: [] }));
    const executor = createToolExecutor(searchCareerTool);

    const result = await executor({ query: "cobol mainframe batch jobs" });

    expect(result.isError).toBeUndefined();
    const structuredContent = result.structuredContent as {
      data: { found: boolean; message?: string };
      citations: unknown[];
    };
    expect(structuredContent.data.found).toBe(false);
    expect(structuredContent.data.message).toBeTruthy();
    expect(structuredContent.data.message?.toLowerCase()).toContain("no relevant content");
    expect(structuredContent.citations).toEqual([]);
  });

  it("maps missing query to a sanitized invalid_input error without calling searchCareer", async () => {
    const executor = createToolExecutor(searchCareerTool);

    const result = await executor({});

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
    expect(fakeSearchCareer).not.toHaveBeenCalled();
  });

  it("maps an empty query to a sanitized invalid_input error without calling searchCareer", async () => {
    const executor = createToolExecutor(searchCareerTool);

    const result = await executor({ query: "" });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
    expect(fakeSearchCareer).not.toHaveBeenCalled();
  });

  it("maps a whitespace-only query to a sanitized invalid_input error without calling searchCareer", async () => {
    const executor = createToolExecutor(searchCareerTool);

    const result = await executor({ query: "   " });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
    expect(fakeSearchCareer).not.toHaveBeenCalled();
  });

  it("maps an over-length query to a sanitized invalid_input error without calling searchCareer", async () => {
    const executor = createToolExecutor(searchCareerTool);

    const result = await executor({ query: "a".repeat(MAX_QUERY_LENGTH + 1) });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
    expect(fakeSearchCareer).not.toHaveBeenCalled();
  });

  it("maps an out-of-range topK (too high) to a sanitized invalid_input error without calling searchCareer", async () => {
    const executor = createToolExecutor(searchCareerTool);

    const result = await executor({ query: "typescript", topK: MAX_TOP_K + 1 });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
    expect(fakeSearchCareer).not.toHaveBeenCalled();
  });

  it("maps an out-of-range topK (too low) to a sanitized invalid_input error without calling searchCareer", async () => {
    const executor = createToolExecutor(searchCareerTool);

    const result = await executor({ query: "typescript", topK: MIN_TOP_K - 1 });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
    expect(fakeSearchCareer).not.toHaveBeenCalled();
  });

  it("maps a non-integer topK to a sanitized invalid_input error without calling searchCareer", async () => {
    const executor = createToolExecutor(searchCareerTool);

    const result = await executor({ query: "typescript", topK: 2.5 });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
    expect(fakeSearchCareer).not.toHaveBeenCalled();
  });

  it("maps an upstream failure (embedding/database error) to a generic internal_error, logging the detail server-side without leaking it to the client", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const upstreamError = new Error(
      "connection to postgres://user:secret-password@internal-host/db failed",
    );
    fakeSearchCareer.mockRejectedValue(upstreamError);
    const executor = createToolExecutor(searchCareerTool);

    const result = await executor({ query: "typescript" });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "internal_error" });
    const message = (result.structuredContent as { message: string }).message;
    expect(message).not.toContain("secret-password");
    expect(message).not.toContain("postgres://");
    expect(consoleErrorSpy).toHaveBeenCalled();
    const loggedDetail = consoleErrorSpy.mock.calls
      .flat()
      .some(
        (arg) =>
          String(arg).includes("connection to postgres") ||
          (arg instanceof Error && arg.message.includes("connection to postgres")),
      );
    expect(loggedDetail).toBe(true);

    consoleErrorSpy.mockRestore();
  });

  it("maps getSearchCareer() throwing at construction time (e.g. missing DATABASE_URL) to a generic internal_error, not a crash", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(getSearchCareer).mockImplementation(() => {
      throw new Error("DATABASE_URL is not set.");
    });
    const executor = createToolExecutor(searchCareerTool);

    const result = await executor({ query: "typescript" });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "internal_error" });
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("declares a human-readable title and an outputSchema for its structuredContent (#241, #242)", () => {
    expect(searchCareerTool.title).toBeTruthy();
    expect(searchCareerTool.outputSchema).toBeDefined();
  });
});
