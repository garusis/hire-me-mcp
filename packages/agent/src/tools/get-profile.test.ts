import type { DomainResult } from "@hire-me-mcp/core";
import * as core from "@hire-me-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withCitationMarkers } from "./citation-markers.js";
import { getProfileInputSchema, getProfileTool } from "./get-profile.js";

vi.mock("@hire-me-mcp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core")>();
  return { ...actual, getProfile: vi.fn() };
});

/** Derived from `core.getProfile`'s return type — same convention as the MCP surface. */
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

  it("has the conventional kebab-case id and a non-empty description", () => {
    expect(getProfileTool.id).toBe("get-profile");
    expect(getProfileTool.description.length).toBeGreaterThan(0);
  });

  it("delegates to packages/core's getProfile and returns its DomainResult with every citation marker-annotated (#270)", async () => {
    const domainResult: DomainResult<Profile> = {
      data: fixtureProfile,
      citations: [{ entityType: "profile", entityId: "profile-fixture", label: "Fixture Person" }],
    };
    vi.mocked(core.getProfile).mockReturnValue(domainResult);

    const result = await getProfileTool.execute?.({}, {} as never);

    expect(core.getProfile).toHaveBeenCalledTimes(1);
    expect(result).toEqual(withCitationMarkers(domainResult));
  });

  it("accepts an empty object as input", () => {
    const parsed = getProfileInputSchema.safeParse({});

    expect(parsed.success).toBe(true);
  });

  it("rejects unexpected extra fields — strict schema, no silent stripping", () => {
    const parsed = getProfileInputSchema.safeParse({ unexpected: "field" });

    expect(parsed.success).toBe(false);
  });

  it("never calls the core service when input validation fails", () => {
    getProfileInputSchema.safeParse({ unexpected: "field" });

    expect(core.getProfile).not.toHaveBeenCalled();
  });
});
