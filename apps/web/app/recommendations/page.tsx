import type { Metadata } from "next";
import type { RecommendationListItemView } from "../../src/lib/content";
import { getProfileView, getRecommendationsListView } from "../../src/lib/content";
import { buildPageMetadata } from "../../src/lib/seo/page-metadata";
import { Card } from "../design-system/primitives/card";
import { Container } from "../design-system/primitives/container";
import { Heading } from "../design-system/primitives/heading";
import { Link } from "../design-system/primitives/link";
import { Prose } from "../design-system/primitives/prose";
import { Section } from "../design-system/primitives/section";
import styles from "./page.module.css";

/**
 * The received-recommendations section of Marcos's LinkedIn profile — the
 * verification link every entry carries in its own `sourceUrl`. Rendered
 * once in the page intro too, sourced from the first entry rather than
 * hardcoded here, so the content files stay the single source of truth.
 */
function RecommendationCard({ item }: { item: RecommendationListItemView }) {
  const { entry, slug } = item;

  return (
    <Card as="article" id={slug}>
      <Heading level={2}>
        <Link href={entry.recommenderProfileUrl}>{entry.recommenderName}</Link>
      </Heading>
      <p className={styles.meta}>{entry.recommenderTitle}</p>
      <p className={styles.meta}>
        {entry.relationship} · <span className="tabular-nums">{entry.date}</span>
      </p>
      <Prose>
        {entry.text.split("\n\n").map((paragraph) => (
          <p key={paragraph.slice(0, 40)}>{paragraph}</p>
        ))}
      </Prose>
      <p className={styles.source}>
        <Link href={entry.sourceUrl}>Verify on LinkedIn</Link>
      </p>
    </Card>
  );
}

/** Description names every recommender, or the documented empty state. */
export function generateMetadata(): Metadata {
  const { profile } = getProfileView();
  const { items } = getRecommendationsListView();
  const description =
    items.length === 0
      ? `${profile.name} hasn't imported any LinkedIn recommendations here yet.`
      : `LinkedIn recommendations ${profile.name} has received, from ${items
          .map((item) => item.entry.recommenderName)
          .join(", ")}.`;
  return buildPageMetadata({ title: "Recommendations", description, path: "/recommendations" });
}

/**
 * Recommendations index (issue 190) — every LinkedIn recommendation Marcos has
 * received, verbatim, most recent first, in the content layer's own order.
 * Each card links to the recommender's LinkedIn profile and to the
 * recommendations section of Marcos's profile (LinkedIn has no
 * per-recommendation permalinks), so anyone can verify the source.
 */
export default function RecommendationsPage() {
  const { items } = getRecommendationsListView();

  return (
    <Section>
      <Container>
        <Heading level={1}>Recommendations</Heading>
        {items.length === 0 ? (
          <Prose className={styles.empty}>
            <p>No recommendations imported yet — check back later.</p>
          </Prose>
        ) : (
          <>
            <Prose className={styles.intro}>
              <p>
                Received on LinkedIn and reproduced verbatim. Every entry links to the recommender's
                profile, and to the{" "}
                <Link href={items[0]?.entry.sourceUrl ?? "/"}>
                  recommendations section of Marcos's LinkedIn profile
                </Link>{" "}
                where the original can be verified (LinkedIn has no per-recommendation permalinks).
              </p>
            </Prose>
            <ul className={styles.list}>
              {items.map((item) => (
                <li key={item.slug}>
                  <RecommendationCard item={item} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Container>
    </Section>
  );
}
