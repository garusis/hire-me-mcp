import { describe, expect, it, vi } from "vitest";
import type { ProfileView } from "../src/lib/content";

const { getProfileView } = vi.hoisted(() => ({ getProfileView: vi.fn() }));
vi.mock("../src/lib/content", () => ({ getProfileView }));

function profileView(overrides: Partial<ProfileView["profile"]> = {}): ProfileView {
  return {
    citations: [],
    profile: {
      id: "profile",
      name: "Ada Fixture",
      headline: "Fixture Engineer",
      location: "Remote",
      availability: "open",
      summary: "A fixture summary of Ada.",
      contacts: [{ label: "GitHub", url: "https://github.com/ada-fixture" }],
      ...overrides,
    },
  };
}

describe("manifest", () => {
  it("names the app from the profile view, not a hardcoded string", async () => {
    getProfileView.mockReturnValue(profileView());
    const { default: manifest } = await import("./manifest.js");

    const result = manifest();

    expect(result.name).toBe("Ada Fixture — Fixture Engineer");
    expect(result.short_name).toBe("Ada Fixture");
  });

  it("changing the stub profile changes the manifest name", async () => {
    getProfileView.mockReturnValue(
      profileView({ name: "Changed Name", headline: "Changed Headline" }),
    );
    const { default: manifest } = await import("./manifest.js");

    const result = manifest();

    expect(result.name).toBe("Changed Name — Changed Headline");
    expect(result.short_name).toBe("Changed Name");
  });

  it("declares at least one icon", async () => {
    getProfileView.mockReturnValue(profileView());
    const { default: manifest } = await import("./manifest.js");

    const result = manifest();

    expect(result.icons?.length).toBeGreaterThan(0);
  });
});
