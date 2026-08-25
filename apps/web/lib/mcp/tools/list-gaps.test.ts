import type { CareerDataRepository, DomainResult } from "@hire-me-mcp/core";
import * as core from "@hire-me-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createToolExecutor } from "../define-tool.js";
import { listGapsTool } from "./list-gaps.js";

vi.mock("@hire-me-mcp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core")>();
  return { ...actual, listGaps: vi.fn() };
});
vi.mock("../../../src/lib/content/repository", () => ({
  getCareerDataRepository: vi.fn(
    () => ({ getDataset: vi.fn() }) as unknown as CareerDataRepository,
  ),
}));

/** Derived from `core.listGaps`'s return type — see `list-gaps.ts` for why. */
type GapListEntry = ReturnType<typeof core.listGaps>["data"][number];

const fixtureGap: GapListEntry = {
  id: "rust",
  name: "Rust",
  aliases: ["rustlang"],
  statement: "No production Rust experience — authored statement, verbatim.",
  relatedSkills: [{ entityType: "skill", entityId: "typescript", label: "TypeScript" }],
};

const fixtureCitations: DomainResult<GapListEntry[]>["citations"] = [
  { entityType: "gap", entityId: "rust", label: "Rust" },
];

describe("listGapsTool", () => {
  beforeEach(() => {
    vi.mocked(core.listGaps).mockReset();
  });

  it("has a non-empty description and the conventional kebab-case name", () => {
    expect(listGapsTool.name).toBe("list-gaps");
    expect(listGapsTool.description.length).toBeGreaterThan(0);
  });

  it("accepts no arguments and returns the stubbed domain service's data unmodified (happy path)", async () => {
    vi.mocked(core.listGaps).mockReturnValue({ data: [fixtureGap], citations: fixtureCitations });
    const executor = createToolExecutor(listGapsTool);

    const result = await executor({});

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      data: [fixtureGap],
      citations: fixtureCitations,
    });
  });

  it("passes the authored statement through byte-identical — no softening or rewording", async () => {
    vi.mocked(core.listGaps).mockReturnValue({ data: [fixtureGap], citations: fixtureCitations });
    const executor = createToolExecutor(listGapsTool);

    const result = await executor({});

    const structuredContent = result.structuredContent as { data: GapListEntry[] };
    expect(structuredContent.data[0]?.statement).toBe(fixtureGap.statement);
  });

  it("passes citations through by deep equality (contract test)", async () => {
    vi.mocked(core.listGaps).mockReturnValue({ data: [fixtureGap], citations: fixtureCitations });
    const executor = createToolExecutor(listGapsTool);

    const result = await executor({});

    const structuredContent = result.structuredContent as { citations: unknown };
    expect(structuredContent.citations).toStrictEqual(fixtureCitations);
  });

  it("passes an empty result through as data — never converts it to an error", async () => {
    vi.mocked(core.listGaps).mockReturnValue({ data: [], citations: [] });
    const executor = createToolExecutor(listGapsTool);

    const result = await executor({});

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ data: [], citations: [] });
  });

  it("maps invalid input (non-object arguments) to a sanitized invalid_input error", async () => {
    const executor = createToolExecutor(listGapsTool);

    const result = await executor(42);

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
  });
});
