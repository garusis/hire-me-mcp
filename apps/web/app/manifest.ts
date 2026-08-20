import type { MetadataRoute } from "next";
import { getProfileView } from "../src/lib/content";
import { COLOR_ACCENT, COLOR_BG_LIGHT } from "../src/lib/seo/site-colors";

/**
 * Web app manifest (#44). Name/short name come from the profile view, same
 * as `generateMetadata` in `app/layout.tsx` — no career fact is hardcoded
 * here either.
 */
export default function manifest(): MetadataRoute.Manifest {
  const { profile } = getProfileView();

  return {
    name: `${profile.name} — ${profile.headline}`,
    short_name: profile.name,
    description: profile.summary,
    start_url: "/",
    display: "standalone",
    background_color: COLOR_BG_LIGHT,
    theme_color: COLOR_ACCENT,
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
