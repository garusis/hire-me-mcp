import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { getWritingEntryView } from "../../../src/lib/content";
import { OgCard } from "../../../src/lib/seo/og-card";
import { loadOgFonts } from "../../../src/lib/seo/og-fonts";

interface WritingOgImageProps {
  params: Promise<{ slug: string }>;
}

/** Per-writing-entry Open Graph image (#44) — `notFound()` for an unrecognized slug, same as `page.tsx`. */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
