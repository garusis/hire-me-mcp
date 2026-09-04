import { describe, expect, it } from "vitest";
import { COLOR_ACCENT, COLOR_ACCENT_FG, COLOR_BG_DARK, COLOR_BG_LIGHT } from "./site-colors";

describe("site-colors", () => {
  it("exposes every color as a valid hex string, matching app/globals.css's tokens", () => {
    for (const color of [COLOR_BG_LIGHT, COLOR_BG_DARK, COLOR_ACCENT, COLOR_ACCENT_FG]) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("matches globals.css's 'Ink & Verdigris' palette (issue 308)", () => {
    expect(COLOR_BG_LIGHT).toBe("#f6f7f4");
    expect(COLOR_BG_DARK).toBe("#0f1418");
    expect(COLOR_ACCENT).toBe("#0f766e");
    expect(COLOR_ACCENT_FG).toBe("#f0fdfa");
  });
});
