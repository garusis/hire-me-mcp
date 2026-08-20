import type { ExperienceListItemView } from "../../src/lib/content";
import { getExperienceListView, getProjectsListView } from "../../src/lib/content";
import { Badge } from "../design-system/primitives/badge";
import { Card } from "../design-system/primitives/card";
import { Container } from "../design-system/primitives/container";
import { Heading } from "../design-system/primitives/heading";
import { Link } from "../design-system/primitives/link";
import { Prose } from "../design-system/primitives/prose";
import { Section } from "../design-system/primitives/section";
import styles from "./page.module.css";
import { getRelatedProjects } from "./related-projects";

function formatPeriod(startDate: string, endDate: string | undefined): string {
  return `${startDate} – ${endDate ?? "Present"}`;
}

function ExperienceEntryCard({ item }: { item: ExperienceListItemView }) {
  const { entry } = item;
  const relatedProjects = getRelatedProjects(entry.tech, getProjectsListView().items);

  return (
    <Card as="article">
      <Heading level={2}>{entry.company}</Heading>
      <div className={styles.meta}>
        <p>{entry.role}</p>
        <p className="tabular-nums">{formatPeriod(entry.startDate, entry.endDate)}</p>
      </div>
      <Prose>
        <p>{entry.summary}</p>
      </Prose>
      <ul className={styles.highlights}>
        {entry.highlights.map((highlight) => (
          <li key={highlight}>{highlight}</li>
        ))}
      </ul>
      <ul className={styles.techList}>
        {entry.tech.map((tag) => (
          <li key={tag}>
            <Badge>{tag}</Badge>
          </li>
        ))}
      </ul>
      {relatedProjects.length > 0 && (
        <div className={styles.related}>
          <Heading level={3}>Related projects</Heading>
          <ul className={styles.relatedList}>
            {relatedProjects.map((related) => (
              <li key={related.slug}>
                <Link href={`/projects/${related.slug}`}>{related.project.name}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/**
 * Chronological role timeline. Ordering, grouping and every field rendered
 * come from the content layer (issue #16) — this route contains no career
 * strings of its own.
 */
export default function ExperiencePage() {
  const { items } = getExperienceListView();

  return (
    <Section>
      <Container>
        <Heading level={1}>Experience</Heading>
        {items.map((item) => (
          <ExperienceEntryCard key={item.slug} item={item} />
        ))}
      </Container>
    </Section>
  );
}
