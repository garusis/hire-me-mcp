/**
 * WCAG 2.x relative-luminance contrast ratio — the same formula the axe
 * color-contrast rule and every accessibility checker use. Kept as a tiny,
 * dependency-free helper so `contrast.test.ts` can assert the design
 * system's own token pairs (read straight from `globals.css`) clear AA
 * without shelling out to a browser or a headless accessibility tool
 * (issue 308).
 */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  let value = hex.replace("#", "");
  if (value.length === 3) {
    value = value
      .split("")
      .map((char) => char + char)
      .join("");
  }
  const int = Number.parseInt(value.slice(0, 6), 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

/** sRGB -> linear-light channel, per the WCAG relative luminance formula. */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** Contrast ratio between two hex colors, in the WCAG-standard [1, 21] range — order-independent. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexToRgb(hexA));
  const lumB = relativeLuminance(hexToRgb(hexB));
  const [lighter, darker] = lumA >= lumB ? [lumA, lumB] : [lumB, lumA];
  return (lighter + 0.05) / (darker + 0.05);
}
