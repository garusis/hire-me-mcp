import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import { getWritingEntryView, listWritingSlugs } from "../../../src/lib/content";
import { Container } from "../../design-system/primitives/container";
import { Heading } from "../../design-system/primitives/heading";
import { Prose } from "../../design-system/primitives/prose";
import { Section } from "../../design-system/primitives/section";
import styles from "./page.module.css";

interface WritingDetailPageProps {
  params: Promise<{ slug: string }>;
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

  return (
    <Section>
      <Container>
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
