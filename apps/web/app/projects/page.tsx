import type { Metadata } from "next";
import type { ProjectListItemView } from "../../src/lib/content";
import { getProfileView, getProjectsListView } from "../../src/lib/content";
import { buildPageMetadata } from "../../src/lib/seo/page-metadata";
import { cx } from "../design-system/lib/cx";
import { Badge } from "../design-system/primitives/badge";
import { Card } from "../design-system/primitives/card";
import { Container } from "../design-system/primitives/container";
import { Heading } from "../design-system/primitives/heading";
import { Link } from "../design-system/primitives/link";
import { Prose } from "../design-system/primitives/prose";
import { Section } from "../design-system/primitives/section";
import {
  computeTagOptions,
  filterProjectsByTags,
  parseSelectedTags,
  TAGS_PARAM,
  toggleTagHref,
} from "./filters";
import styles from "./page.module.css";

interface ProjectsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function ProjectCard({ item }: { item: ProjectListItemView }) {
  const { project, slug } = item;
  return (
    <Card as="article">
      <Heading level={2}>
        <Link href={`/projects/${slug}`}>{project.name}</Link>
      </Heading>
      <Prose>
        <p>{project.summary}</p>
      </Prose>
      <ul className={styles.techList}>
        {project.tech.map((tag) => (
          <li key={tag}>
            <Badge>{tag}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function FilterControls({ options, selectedTags }: { options: string[]; selectedTags: string[] }) {
  return (
    <nav aria-label="Filter projects by technology" className={styles.filterNav}>
      <ul className={styles.filterList}>
        {options.map((tag) => {
          const selected = selectedTags.includes(tag);
          return (
            <li key={tag}>
              <Link
                href={toggleTagHref(selectedTags, tag)}
                aria-current={selected || undefined}
                className={cx(styles.filterTag, selected && styles.filterTagSelected)}
              >
                {tag}
                {selected ? <span className="visually-hidden"> (selected)</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
      {selectedTags.length > 0 && <Link href="/projects">Clear filters</Link>}
    </nav>
  );
}

/** Description names every project, so it changes whenever the content layer does. */
export function generateMetadata(): Metadata {
  const { profile } = getProfileView();
  const { items } = getProjectsListView();
  const names = items.map((item) => item.project.name).join(", ");
  return buildPageMetadata({
    title: "Projects",
    description: `${profile.name}'s projects: ${names}.`,
    path: "/projects",
  });
}

/**
 * Project index, server-rendered unfiltered by default. Filtering is
 * URL-driven via `searchParams` (`?tags=a,b`) rather than a client island,
 * so the base route stays crawlable and every filtered view is a shareable
 * link. Filter options are computed from the projects the content layer
 * returns, not a hardcoded taxonomy.
 */
export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const params = await searchParams;
  const { items } = getProjectsListView();
  const options = computeTagOptions(items);
  const selectedTags = parseSelectedTags(params[TAGS_PARAM]);
  const filtered = filterProjectsByTags(items, selectedTags);

  return (
    <Section>
      <Container>
        <Heading level={1}>Projects</Heading>
        <FilterControls options={options} selectedTags={selectedTags} />
        {filtered.length === 0 ? (
          <Prose>
            <p>No projects match the selected filters.</p>
          </Prose>
        ) : (
          <ul className={styles.list}>
            {filtered.map((item) => (
              <li key={item.slug}>
                <ProjectCard item={item} />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </Section>
  );
}
