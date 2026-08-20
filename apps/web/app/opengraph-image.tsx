import { ImageResponse } from "next/og";
import { getProfileView } from "../src/lib/content";
import { OgCard } from "../src/lib/seo/og-card";
import { loadOgFonts } from "../src/lib/seo/og-fonts";

/** Default site-wide Open Graph image (#44) — every route falls back to this unless it defines its own. */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const { profile } = getProfileView();
  const fonts = await loadOgFonts();

  return new ImageResponse(
    <OgCard kicker={profile.name} title={profile.headline} description={profile.summary} />,
    { ...size, fonts },
  );
}
