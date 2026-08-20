import { describe, expect, it, vi } from "vitest";
import type { ProfileView } from "../src/lib/content";

const { getProfileView } = vi.hoisted(() => ({ getProfileView: vi.fn() }));
vi.mock("../src/lib/content", () => ({ getProfileView }));

function profileView(): ProfileView {
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
    },
  };
}

describe("default opengraph image", () => {
  it("declares the standard 1200x630 Open Graph size", async () => {
    const { size } = await import("./opengraph-image.js");
    expect(size).toEqual({ width: 1200, height: 630 });
  });

  it("renders a 200 PNG image response built from the profile view", async () => {
    getProfileView.mockReturnValue(profileView());
    const { default: OpengraphImage } = await import("./opengraph-image.js");

    const response = await OpengraphImage();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });
});
