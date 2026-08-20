import { describe, expect, it } from "vitest";
import { bodyFont, displayFont, monoFont } from "./fonts.js";

describe("fonts", () => {
  it("loads the display face with a CSS variable and swap-safe className", () => {
    expect(displayFont.variable).toBe("--font-display-fraunces");
    expect(displayFont.className.length).toBeGreaterThan(0);
  });

  it("loads the body face with a CSS variable and swap-safe className", () => {
    expect(bodyFont.variable).toBe("--font-body-plex-sans");
    expect(bodyFont.className.length).toBeGreaterThan(0);
  });

  it("loads the mono face with a CSS variable and swap-safe className", () => {
    expect(monoFont.variable).toBe("--font-mono-plex-mono");
    expect(monoFont.className.length).toBeGreaterThan(0);
  });
});
