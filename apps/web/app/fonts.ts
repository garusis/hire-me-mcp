import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";

/**
 * Self-hosted, build-time font loading via `next/font/google` — no runtime
 * requests to Google Fonts, `display: swap` so first paint never blocks on
 * font download. See apps/web/README.md ("Design system — typography") for
 * the pairing rationale ("Ink & Verdigris", issue 308): Space Grotesk
 * (geometric, technical display face) over Inter (a quiet, engineered body
 * face with `cv11`/`ss01` feature settings for single-storey a's and open
 * forms) and JetBrains Mono for the endpoint URL, code snippets and
 * location/date metadata.
 */
export const displayFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-display-space-grotesk",
});

export const bodyFont = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-body-inter",
});

export const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono-jetbrains-mono",
});
