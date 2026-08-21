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
 *
 * `images` is likewise set explicitly, not left for Next to infer: setting
 * a route's own `openGraph` object REPLACES the object it would otherwise
 * inherit from `app/layout.tsx`/the nearest `opengraph-image.tsx` file
 * convention wholesale, rather than merging into it — a route calling this
 * with no `image` override lost its OG image entirely (caught by the
 * preview e2e suite in `seo.spec.ts` against the real deployed site; the
 * unit tests here don't exercise Next's actual metadata-resolution merge,
 * only this function's own return value, so this class of bug is invisible
 * to them and only the e2e assertion catches it). Every route now names its
 * own image explicitly: `/opengraph-image` (the site default, #44) unless
 * the route has its own `opengraph-image.tsx` (project/writing detail
 * pages), which pass that route's own image path instead.
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
  /** Path to this route's OG image, combined with the site URL. Defaults to `/opengraph-image` (the site-wide default, #44) — override for a route with its own `opengraph-image.tsx`. */
  image?: string;
}

/** Builds `title`/`description`/`alternates.canonical`/`openGraph`/`twitter` for one route, from that route's own title, description and image. */
export function buildPageMetadata(
  { title, description, path, type = "website", image = "/opengraph-image" }: PageMetadataInput,
  siteUrl: string = getSiteUrl(),
): Metadata {
  const imageUrl = `${siteUrl}${image}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: `${siteUrl}${path}`,
      type,
      images: [imageUrl],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}
