import { describe, expect, it } from "vitest";
import { OgCard } from "./og-card";

describe("OgCard", () => {
  it("renders the kicker, title and description passed in", () => {
    const element = OgCard({
      kicker: "Project",
      title: "Alpha Project",
      description: "The summary.",
    });

    const asString = JSON.stringify(element);
    expect(asString).toContain("Project");
    expect(asString).toContain("Alpha Project");
    expect(asString).toContain("The summary.");
  });

  it("uses the site's current type pairing and foreground colors (issue 308)", () => {
    const element = OgCard({ kicker: "Project", title: "Alpha Project", description: "x" });
    const asString = JSON.stringify(element);

    expect(asString).toContain("Space Grotesk");
    expect(asString).toContain("Inter");
    expect(asString).not.toContain("Fraunces");
    expect(asString).not.toContain("IBM Plex Sans");
    expect(asString).toContain("#14181d");
    expect(asString).toContain("#5a6470");
  });
});
