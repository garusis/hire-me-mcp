import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

/**
 * Self-hosted, build-time font loading via `next/font/google` — no runtime
 * requests to Google Fonts, `display: swap` so first paint never blocks on
 * font download. See apps/web/README.md ("Design system — typography") for
 * the pairing rationale: Fraunces (characterful display serif) over IBM
 * Plex Sans (quiet, engineered body face) and IBM Plex Mono for tabular /
 * code content, all three sharing the same technical-but-warm register.
 */
export const displayFont = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-display-fraunces",
});

export const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-body-plex-sans",
});

export const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono-plex-mono",
});
