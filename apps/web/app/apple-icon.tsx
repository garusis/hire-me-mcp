import { ImageResponse } from "next/og";
import { getProfileView } from "../src/lib/content";
import { loadOgFonts } from "../src/lib/seo/og-fonts";
import { COLOR_ACCENT, COLOR_ACCENT_FG } from "../src/lib/seo/site-colors";

/** Next.js file-convention Apple touch icon (`/apple-icon`) — same monogram as `/icon`, larger. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

function monogram(name: string): string {
  return (name.trim().at(0) ?? "?").toUpperCase();
}

export default async function AppleIcon() {
  const { profile } = getProfileView();
  const fonts = await loadOgFonts();
  const displayFont = fonts.find((font) => font.name === "Fraunces");
  if (!displayFont) {
    throw new Error("Fraunces OG font failed to load");
  }

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: COLOR_ACCENT,
        color: COLOR_ACCENT_FG,
        fontFamily: "Fraunces",
        fontSize: 96,
        fontWeight: 600,
      }}
    >
      {monogram(profile.name)}
    </div>,
    { ...size, fonts: [displayFont] },
  );
}
