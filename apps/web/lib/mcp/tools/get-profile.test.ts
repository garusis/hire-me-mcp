import type { CareerDataRepository, DomainResult } from "@hire-me-mcp/core";
import * as core from "@hire-me-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withCitationSiteUrls } from "../citation-site-urls.js";
import { createToolExecutor } from "../define-tool.js";
import { getProfileTool } from "./get-profile.js";

vi.mock("@hire-me-mcp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core")>();
  return { ...actual, getProfile: vi.fn() };
});
vi.mock("../../../src/lib/content/repository", () => ({
  getCareerDataRepository: vi.fn(
    () => ({ getDataset: vi.fn() }) as unknown as CareerDataRepository,
  ),
}));

/** Derived from `core.getProfile`'s return type — see `get-profile.ts` for why. */
type Profile = ReturnType<typeof core.getProfile>["data"];

const fixtureProfile: Profile = {
  id: "profile-fixture",
  name: "Fixture Person",
  headline: "Fixture Engineer",
  location: "Fixtureville",
  availability: "open",
  summary: "Fixture summary.",
  contacts: [{ label: "Website", url: "https://example.test" }],
};

describe("getProfileTool", () => {
  beforeEach(() => {
    vi.mocked(core.getProfile).mockReset();
  });

  it("has a non-empty description and the conventional kebab-case name", () => {
    expect(getProfileTool.name).toBe("get-profile");
    expect(getProfileTool.description.length).toBeGreaterThan(0);
  });

  it("accepts no arguments and returns the stubbed domain service's data unmodified (happy path)", async () => {
    const domainResult: DomainResult<Profile> = {
      data: fixtureProfile,
      citations: [{ entityType: "profile", entityId: "profile-fixture", label: "Fixture Person" }],
    };
    vi.mocked(core.getProfile).mockReturnValue(domainResult);
    const executor = createToolExecutor(getProfileTool);

    const result = await executor({});

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      data: domainResult.data,
      citations: withCitationSiteUrls(domainResult.citations),
    });
  });

  it("passes citations through by deep equality (contract test)", async () => {
    const citations: DomainResult<Profile>["citations"] = [
      { entityType: "profile", entityId: "profile-fixture", label: "Fixture Person" },
    ];
    vi.mocked(core.getProfile).mockReturnValue({ data: fixtureProfile, citations });
    const executor = createToolExecutor(getProfileTool);

    const result = await executor({});

    const structuredContent = result.structuredContent as { citations: unknown };
    expect(structuredContent.citations).toStrictEqual(withCitationSiteUrls(citations));
  });

  it("passes an unusual/arbitrary domain payload through unmodified — no reshaping of handler output", async () => {
    const unusualPayload = { ...fixtureProfile, summary: "Not-claimed-shaped edge value: 0" };
    vi.mocked(core.getProfile).mockReturnValue({ data: unusualPayload, citations: [] });
    const executor = createToolExecutor(getProfileTool);

    const result = await executor({});

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ data: unusualPayload, citations: [] });
  });

  it("maps invalid input (non-object arguments) to a sanitized invalid_input error", async () => {
    const executor = createToolExecutor(getProfileTool);

    const result = await executor("not an object");

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
  });
});
