/**
 * Font loading for `next/og`'s `ImageResponse` (#44). `ImageResponse`
 * cannot use `next/font/google` (`app/fonts.ts`) directly — it needs raw
 * font bytes passed via its own `fonts` option. Rather than fetch Google
 * Fonts at request time (a network dependency this build path shouldn't
 * have), the same two weights `app/fonts.ts` loads are checked into
 * `apps/web/assets/fonts/` and read from disk here, matching the site's
 * actual typefaces (Fraunces display / IBM Plex Sans body — see
 * `app/globals.css`'s `--font-display`/`--font-body` tokens).
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FONTS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "assets",
  "fonts",
);

export interface OgFont {
  name: string;
  data: Buffer;
  weight: 400 | 500 | 600 | 700;
  style: "normal" | "italic";
}

let cachedFonts: OgFont[] | undefined;

/** Loads (and memoizes) the display + body font files OG image routes render with. */
export async function loadOgFonts(): Promise<OgFont[]> {
  if (cachedFonts) {
    return cachedFonts;
  }

  const [displayData, bodyData] = await Promise.all([
    readFile(join(FONTS_DIR, "Fraunces-SemiBold.ttf")),
    readFile(join(FONTS_DIR, "IBMPlexSans-SemiBold.ttf")),
  ]);

  cachedFonts = [
    { name: "Fraunces", data: displayData, weight: 600, style: "normal" },
    { name: "IBM Plex Sans", data: bodyData, weight: 600, style: "normal" },
  ];
  return cachedFonts;
}
