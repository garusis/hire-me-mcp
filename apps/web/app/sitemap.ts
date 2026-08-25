import type { MetadataRoute } from "next";
import { getSiteUrl } from "../src/lib/config/site-url";
import { getWritingListView, listProjectSlugs } from "../src/lib/content";

/**
 * Every statically-rendered route that carries no per-item slug. Kept as
 * the one hardcoded list in this file — it enumerates *routes*, not career
 * facts, so it doesn't fall under the content-layer-sourcing rule the way a
 * title or description would.
 */
const STATIC_ROUTES = [
  "",
  "/experience",
  "/projects",
  "/skills",
  "/writing",
  "/recommendations",
  "/mcp",
  "/privacy",
] as const;

/**
 * `sitemap.xml`. Every dynamic segment is enumerated from the same content
 * layer accessors `generateStaticParams` uses (`listProjectSlugs`,
 * `getWritingListView`) — see `app/projects/[slug]/page.tsx` and
 * `app/writing/[slug]/page.tsx` — so this can never list a stale slug or
 * miss a new one. `lastModified` is set only where the data actually
 * provides a date (writing entries' `publishedDate`); career-data projects
 * have no date field, so their entries omit it rather than fabricate one.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const toUrl = (path: string) => `${base}${path}`;

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({ url: toUrl(path) }));

  const projectEntries: MetadataRoute.Sitemap = listProjectSlugs().map((slug) => ({
    url: toUrl(`/projects/${slug}`),
  }));

  const writingEntries: MetadataRoute.Sitemap = getWritingListView().items.map((item) => ({
    url: toUrl(`/writing/${item.slug}`),
    lastModified: new Date(item.entry.publishedDate),
  }));

  return [...staticEntries, ...projectEntries, ...writingEntries];
}
