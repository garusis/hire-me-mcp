import type { Metadata } from "next";
import type { EducationListItemView, ExperienceListItemView } from "../../src/lib/content";
import {
  getEducationListView,
  getExperienceListView,
  getProfileView,
  getProjectsListView,
} from "../../src/lib/content";
import { toSlug } from "../../src/lib/content/slug";
import { buildPageMetadata } from "../../src/lib/seo/page-metadata";
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
  const { entry, slug } = item;
  const relatedProjects = getRelatedProjects(entry, getProjectsListView().items);

  return (
    <Card as="article" id={slug}>
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
 * Title stays a static route label ("Experience" — matching this page's own
 * `<h1>`, not a career fact); the description and canonical are what #44
 * requires be sourced from/derived per route.
 */
export function generateMetadata(): Metadata {
  const { profile } = getProfileView();
  const { items } = getExperienceListView();
  const companies = items.map((item) => item.entry.company).join(", ");
  return buildPageMetadata({
    title: "Experience",
    description: `${profile.name}'s professional experience: ${companies}.`,
    path: "/experience",
  });
}

/**
 * One education credential (issue 231) — institution, credential, and the dates
 * exactly as authored: a missing `endDate` means in progress, a missing
 * `startDate` is genuinely not on record, and neither is ever invented
 * here (the schema's own documented convention).
 */
function formatEducationPeriod(
  startDate: string | undefined,
  endDate: string | undefined,
): string | undefined {
  if (startDate !== undefined) {
    return formatPeriod(startDate, endDate);
  }
  // No start on record — show the completion date alone rather than a
  // fabricated range; both missing renders no period at all.
  return endDate;
}

function EducationEntryCard({ item }: { item: EducationListItemView }) {
  const { entry } = item;
  const period = formatEducationPeriod(entry.startDate, entry.endDate);

  return (
    // Anchor derived through `toSlug`, exactly like the role cards above and
    // like `citation-href.ts`'s `education` case — so an `[cite:education:...]`
    // citation's `#fragment` always lands on a card that really exists
    // (issue 227).
    <Card as="article" id={toSlug(entry.id)}>
      <Heading level={3}>{entry.institution}</Heading>
      <div className={styles.meta}>
        <p>{entry.credential}</p>
        {period !== undefined && <p className="tabular-nums">{period}</p>}
      </div>
    </Card>
  );
}

/**
 * Chronological role timeline. Ordering, grouping and every field rendered
 * come from the content layer (issue #16) — this route contains no career
 * strings of its own.
 *
 * Education (issue 231) renders below the roles from the same career dataset the
 * CV PDF and the MCP `list-education` tool already publish, so the site can
 * no longer be the one surface that doesn't know about it.
 */
export default function ExperiencePage() {
  const { items } = getExperienceListView();
  const education = getEducationListView().items;

  return (
    <Section>
      <Container>
        <Heading level={1}>Experience</Heading>
        {items.map((item) => (
          <ExperienceEntryCard key={item.slug} item={item} />
        ))}
        {education.length > 0 && (
          <>
            <Heading level={2} id="education">
              Education
            </Heading>
            {education.map((item) => (
              <EducationEntryCard key={item.entry.id} item={item} />
            ))}
          </>
        )}
      </Container>
    </Section>
  );
}
