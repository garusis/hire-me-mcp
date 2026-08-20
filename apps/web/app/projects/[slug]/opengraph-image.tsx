import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { getProjectDetailView, listProjectSlugs } from "../../../src/lib/content";
import { OgCard } from "../../../src/lib/seo/og-card";
import { loadOgFonts } from "../../../src/lib/seo/og-fonts";

interface ProjectOgImageProps {
  params: Promise<{ slug: string }>;
}

/** Per-project Open Graph image (#44) — `notFound()` for an unrecognized slug, same as `page.tsx`. */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Exactly the slugs `page.tsx` prerenders (issue 29), and for the same
 * reason (issue 119): without its own `generateStaticParams`, a dynamic-segment
 * metadata route like this one builds as a fully dynamic function (`ƒ` in
 * `next build`'s route table) that runs in the Vercel Lambda on every
 * request, rather than being prerendered as a static image at build time
 * (`●`) like the sibling `page.tsx`. At request time it read
 * `packages/career-data/content/**` and `apps/web/assets/fonts/*.ttf`
 * through paths Node File Trace didn't pick up for this route even with
 * `outputFileTracingIncludes` configured for it (see `next.config.ts`) —
 * confirmed 500ing in production despite passing locally and against every
 * local trace assertion. Making the route static removes the Vercel Lambda
 * — and therefore this whole class of tracing gap — from the equation
 * entirely: the image is rendered once, in the build container (full
 * repo checkout, no tracing involved), and served as a static asset from
 * then on, exactly like the root `/opengraph-image`.
 */
export function generateStaticParams() {
  return listProjectSlugs().map((slug) => ({ slug }));
}

export default async function ProjectOpengraphImage({ params }: ProjectOgImageProps) {
  const { slug } = await params;
  const view = getProjectDetailView(slug);
  if (!view.found) {
    notFound();
  }
  const { project } = view.value;
  const fonts = await loadOgFonts();

  return new ImageResponse(
    <OgCard kicker="Project" title={project.name} description={project.summary} />,
    { ...size, fonts },
  );
}
