import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import { getProfileView, getWritingEntryView, listWritingSlugs } from "../../../src/lib/content";
import { buildArticleJsonLd } from "../../../src/lib/seo/json-ld";
import { JsonLdScript } from "../../../src/lib/seo/json-ld-script";
import { buildPageMetadata } from "../../../src/lib/seo/page-metadata";
import { Container } from "../../design-system/primitives/container";
import { Heading } from "../../design-system/primitives/heading";
import { Prose } from "../../design-system/primitives/prose";
import { Section } from "../../design-system/primitives/section";
import styles from "./page.module.css";

interface WritingDetailPageProps {
  params: Promise<{ slug: string }>;
}

/** Empty `{}` for an unknown slug — same rationale as `/projects/[slug]`'s `generateMetadata`. */
export async function generateMetadata({ params }: WritingDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const view = getWritingEntryView(slug);
  if (!view.found) {
    return {};
  }
  const { entry } = view.value;
  return buildPageMetadata({
    title: entry.title,
    description: entry.summary,
    path: `/writing/${slug}`,
    type: "article",
    image: `/writing/${slug}/opengraph-image`,
  });
}

/**
 * Exactly the slugs `packages/career-data`'s writing entries expose, via the
 * content layer — no separately maintained list. Real `writing` content is
 * currently empty, so this returns `[]` today; the route activates for
 * whichever future entries are authored without needing a page change (same
 * pattern as `/projects/[slug]`, #29).
 */
export function generateStaticParams() {
  return listWritingSlugs().map((slug) => ({ slug }));
}

/**
 * Local writing detail route — for entries the data package hosts itself
 * (MDX `body`), as opposed to ones with a canonical external `url` that
 * `/writing`'s index links to directly. Same `compileMDX` approach as
 * `/projects/[slug]`.
 */
export default async function WritingDetailPage({ params }: WritingDetailPageProps) {
  const { slug } = await params;
  const view = getWritingEntryView(slug);
  if (!view.found) {
    notFound();
  }
  const { entry } = view.value;
  const { content: mdxContent } = await compileMDX({ source: entry.body });
  const { profile } = getProfileView();

  return (
    <Section>
      <Container>
        <JsonLdScript data={buildArticleJsonLd({ slug: view.slug, ...view.value }, profile.name)} />
        <Heading level={1}>{entry.title}</Heading>
        <p className={`${styles.meta} tabular-nums`}>{entry.publishedDate}</p>
        <Prose>
          <p>{entry.summary}</p>
        </Prose>
        <Prose>{mdxContent}</Prose>
      </Container>
    </Section>
  );
}
