import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { getProjectDetailView } from "../../../src/lib/content";
import { OgCard } from "../../../src/lib/seo/og-card";
import { loadOgFonts } from "../../../src/lib/seo/og-fonts";

interface ProjectOgImageProps {
  params: Promise<{ slug: string }>;
}

/** Per-project Open Graph image (#44) — `notFound()` for an unrecognized slug, same as `page.tsx`. */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
