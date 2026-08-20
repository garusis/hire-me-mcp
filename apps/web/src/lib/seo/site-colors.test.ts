import { describe, expect, it } from "vitest";
import { COLOR_ACCENT, COLOR_ACCENT_FG, COLOR_BG_DARK, COLOR_BG_LIGHT } from "./site-colors";

describe("site-colors", () => {
  it("exposes every color as a valid hex string, matching app/globals.css's tokens", () => {
    for (const color of [COLOR_BG_LIGHT, COLOR_BG_DARK, COLOR_ACCENT, COLOR_ACCENT_FG]) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
