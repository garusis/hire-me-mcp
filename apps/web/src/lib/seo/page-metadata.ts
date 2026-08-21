/**
 * Shared per-route metadata builder for #38: every route's own
 * `generateMetadata` already computes a route-specific `title`/`description`
 * (#44) but only fed them into `title`/`description`/`alternates.canonical`
 * — `openGraph`/`twitter` were left unset, so those routes silently
 * inherited `app/layout.tsx`'s site-wide defaults (the home page's own
 * title, description and root URL) instead of their own. `buildPageMetadata`
 * derives `openGraph.title`/`description`/`url` and `twitter.title`/
 * `description` from the same route-specific values, so every route's OG
 * card and Twitter card actually describe that route.
 */

import type { Metadata } from "next";
import { getSiteUrl } from "../config/site-url";

export interface PageMetadataInput {
  title: string;
  description: string;
  /** Route path, e.g. `/experience` — combined with the site URL for `alternates.canonical` and `openGraph.url`. */
  path: string;
  /** `og:type` — `"website"` for listing/index routes, `"article"` for a single writing/project entry. Defaults to `"website"`. */
  type?: "website" | "article";
}

/** Builds `title`/`description`/`alternates.canonical`/`openGraph`/`twitter` for one route, from that route's own title and description. */
export function buildPageMetadata(
  { title, description, path, type = "website" }: PageMetadataInput,
  siteUrl: string = getSiteUrl(),
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: `${siteUrl}${path}`,
      type,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
