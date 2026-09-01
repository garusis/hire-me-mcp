import type { MetadataRoute } from "next";
import { getRobotsIndexable, getSiteUrl } from "../src/lib/config/site-url";

/**
 * `robots.txt`. Only a genuine production deploy (`getRobotsIndexable()`,
 * #44) allows crawling — every preview deploy and local dev disallows
 * everything, so a preview URL is never indexed alongside (or instead of)
 * production.
 *
 * Even on production, `?tags=` filter URLs are disallowed: the /projects
 * tag filters combine into 2^N distinct URLs, and crawlers that walk them
 * (Sep 2026: meta-externalagent, ~200K requests/day) burn through the
 * Edge Request and Function Invocation quotas. The canonical, unfiltered
 * pages stay fully crawlable.
 */
export default function robots(): MetadataRoute.Robots {
  const indexable = getRobotsIndexable();

  return {
    rules: {
      userAgent: "*",
      disallow: indexable ? ["/*?tags="] : "/",
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
