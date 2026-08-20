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
});
