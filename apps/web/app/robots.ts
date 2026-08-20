import type { MetadataRoute } from "next";
import { getRobotsIndexable, getSiteUrl } from "../src/lib/config/site-url";

/**
 * `robots.txt`. Only a genuine production deploy (`getRobotsIndexable()`,
 * #44) allows crawling — every preview deploy and local dev disallows
 * everything, so a preview URL is never indexed alongside (or instead of)
 * production.
 */
export default function robots(): MetadataRoute.Robots {
  const indexable = getRobotsIndexable();

  return {
    rules: {
      userAgent: "*",
      ...(indexable ? {} : { disallow: "/" }),
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
