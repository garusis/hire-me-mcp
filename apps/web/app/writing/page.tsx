import type { Metadata } from "next";
import type { WritingListItemView } from "../../src/lib/content";
import { getProfileView, getWritingListView } from "../../src/lib/content";
import { buildPageMetadata } from "../../src/lib/seo/page-metadata";
import { Card } from "../design-system/primitives/card";
import { Container } from "../design-system/primitives/container";
import { Heading } from "../design-system/primitives/heading";
import { Link } from "../design-system/primitives/link";
import { Prose } from "../design-system/primitives/prose";
import { Section } from "../design-system/primitives/section";
import styles from "./page.module.css";

function WritingEntryCard({ item }: { item: WritingListItemView }) {
  const { entry, slug } = item;
  const destination = entry.url ?? `/writing/${slug}`;

  return (
    <Card as="article">
      <Heading level={2}>
        <Link href={destination}>{entry.title}</Link>
      </Heading>
      <p className={styles.meta}>
        <span className="tabular-nums">{entry.publishedDate}</span>
      </p>
      <Prose>
        <p>{entry.summary}</p>
      </Prose>
    </Card>
  );
}

/**
 * Description lists every writing entry's title, or names the documented
 * empty state.
 *
 * The route is `noindex` while the dataset is empty (issue 278): issue 233
 * already removed Writing from the nav, the sitemap and llms.txt, but the
 * route stayed live and `index, follow` — so the one page saying nothing has
 * been published was the one page still inviting crawlers. The route keeps
 * returning 200 rather than redirecting or 404ing, so any existing inbound
 * link still resolves; it just stops asking to be indexed. This is driven by
 * the same `items.length` the body renders from, never a hardcoded flag: the
 * first authored entry makes the page indexable again on its own.
 */
export function generateMetadata(): Metadata {
  const { profile } = getProfileView();
  const { items } = getWritingListView();
  const description =
    items.length === 0
      ? `${profile.name} hasn't published any writing here yet.`
      : `${profile.name}'s writing: ${items.map((item) => item.entry.title).join(", ")}.`;
  return buildPageMetadata({
    title: "Writing",
    description,
    path: "/writing",
    indexable: items.length > 0,
  });
}

/**
 * Writing index — title, date, summary and destination for every entry the
 * content layer returns, in its own order. Real `writing` content is
 * currently empty (no articles authored yet — see
 * `src/lib/content/writing.ts`), so this renders a documented empty state
 * rather than an empty, unexplained page; the list-rendering path below is
 * exercised by `page.test.tsx` against a stubbed content layer and will
 * activate automatically once real entries are authored, with no page
 * change required.
 */
export default function WritingPage() {
  const { items } = getWritingListView();

  return (
    <Section>
      <Container>
        <Heading level={1}>Writing</Heading>
        {items.length === 0 ? (
          <Prose className={styles.empty}>
            <p>Nothing published here yet — check back later.</p>
          </Prose>
        ) : (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.slug}>
                <WritingEntryCard item={item} />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </Section>
  );
}
