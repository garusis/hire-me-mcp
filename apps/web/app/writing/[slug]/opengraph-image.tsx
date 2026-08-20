import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { getWritingEntryView, listWritingSlugs } from "../../../src/lib/content";
import { OgCard } from "../../../src/lib/seo/og-card";
import { loadOgFonts } from "../../../src/lib/seo/og-fonts";

interface WritingOgImageProps {
  params: Promise<{ slug: string }>;
}

/** Per-writing-entry Open Graph image (#44) — `notFound()` for an unrecognized slug, same as `page.tsx`. */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Exactly the slugs `page.tsx` prerenders — locally-hosted entries only,
 * same as `page.tsx` — and for the same reason as the sibling
 * `/projects/[slug]/opengraph-image` (issue 119): without its own
 * `generateStaticParams`, this dynamic-segment metadata route built as a
 * fully dynamic function (`ƒ`) that ran in the Vercel Lambda per request,
 * where its `packages/career-data/content/**` and
 * `apps/web/assets/fonts/*.ttf` reads fell outside what Node File Trace
 * captured for it even with `outputFileTracingIncludes` configured (see
 * `next.config.ts`) — 500ing in production. Making it static removes the
 * Lambda, and with it this whole class of tracing gap: the image renders
 * once in the build container and ships as a static asset from then on,
 * like the root `/opengraph-image`.
 */
export function generateStaticParams() {
  return listWritingSlugs().map((slug) => ({ slug }));
}

export default async function WritingOpengraphImage({ params }: WritingOgImageProps) {
  const { slug } = await params;
  const view = getWritingEntryView(slug);
  if (!view.found) {
    notFound();
  }
  const { entry } = view.value;
  const fonts = await loadOgFonts();

  return new ImageResponse(
    <OgCard kicker="Writing" title={entry.title} description={entry.summary} />,
    { ...size, fonts },
  );
}
