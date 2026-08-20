/**
 * Shared 1200x630 Open Graph card layout for #44's `ImageResponse` routes
 * (`app/opengraph-image.tsx`, `app/projects/[slug]/opengraph-image.tsx`,
 * `app/writing/[slug]/opengraph-image.tsx`). Colors and type pairing match
 * the design system's tokens (`app/globals.css`'s `--color-*` and
 * `--font-*`, `app/fonts.ts`'s Fraunces/IBM Plex Sans pairing) — satori
 * (which `ImageResponse` renders through) only understands inline styles,
 * not CSS custom properties, so the token values are duplicated here as
 * literals rather than consumed from `globals.css`.
 */

import { COLOR_ACCENT, COLOR_ACCENT_FG, COLOR_BG_LIGHT } from "./site-colors";

export interface OgCardProps {
  kicker: string;
  title: string;
  description: string;
}

const COLOR_BG = COLOR_BG_LIGHT;
// Not in site-colors.ts: these two are OG-card-only shades (foreground /
// muted foreground on the card's light background), not reused by any
// app/* file the hardcoded-hex rule scans — so no import-indirection is
// needed for them the way the shared brand colors above need one.
const COLOR_FG = "#1c1a17";
const COLOR_FG_MUTED = "#5c584f";

export function OgCard({ kicker, title, description }: OgCardProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: COLOR_BG,
        color: COLOR_FG,
        fontFamily: "IBM Plex Sans",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 24,
          fontWeight: 600,
          color: COLOR_ACCENT,
          textTransform: "uppercase",
          letterSpacing: 2,
        }}
      >
        <div
          style={{
            display: "flex",
            width: 44,
            height: 44,
            borderRadius: 999,
            background: COLOR_ACCENT,
            color: COLOR_ACCENT_FG,
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Fraunces",
            fontSize: 22,
          }}
        >
          {kicker.at(0)?.toUpperCase() ?? "?"}
        </div>
        {kicker}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            display: "flex",
            fontFamily: "Fraunces",
            fontSize: 64,
            fontWeight: 600,
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", fontSize: 28, color: COLOR_FG_MUTED, lineHeight: 1.4 }}>
          {description}
        </div>
      </div>
    </div>
  );
}
