import { describe, expect, it } from "vitest";
import { loadOgFonts } from "./og-fonts";

describe("loadOgFonts", () => {
  it("loads the design system's display and body font files as binary data next/og's ImageResponse can consume", async () => {
    const fonts = await loadOgFonts();

    expect(fonts.length).toBeGreaterThanOrEqual(2);
    for (const font of fonts) {
      expect(font.data.byteLength).toBeGreaterThan(0);
    }
  });

  it("includes the Fraunces display font and the IBM Plex Sans body font, matching app/fonts.ts's pairing", async () => {
    const fonts = await loadOgFonts();
    const names = fonts.map((font) => font.name);

    expect(names).toContain("Fraunces");
    expect(names).toContain("IBM Plex Sans");
  });

  it("memoizes — a second call returns the same array instance rather than re-reading disk", async () => {
    const first = await loadOgFonts();
    const second = await loadOgFonts();

    expect(second).toBe(first);
  });
});
