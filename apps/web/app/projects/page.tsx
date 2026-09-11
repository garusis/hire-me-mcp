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
  addableTagsFor,
  capSelectedTags,
  computeTagOptions,
  filterProjectsByTags,
  MAX_SELECTED_TAGS,
  parseSelectedTags,
  partitionSelectedTags,
  TAGS_PARAM,
  toggleTagHref,
} from "./filters";
import styles from "./page.module.css";

interface ProjectsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * One project card. A `featured` project (issue 191) gets the flagship
 * treatment: an accent badge naming it the flagship of this portfolio, its
 * role, and its external links, on a visually distinct card — while still
 * living inside the same filterable list as every other project. Which
 * project (if any) is the flagship is purely a content-layer decision
 * (`featured: true` on the record), never an id hardcoded here.
 */
function ProjectCard({ item }: { item: ProjectListItemView }) {
  const { project, slug } = item;
  const flagship = project.featured === true;
  return (
    <Card as="article" className={cx(flagship && styles.flagshipCard)}>
      {flagship && (
        <p className={styles.flagshipBadge}>
          <Badge variant="status">Flagship project of this portfolio</Badge>
        </p>
      )}
      <Heading level={2}>
        <Link href={`/projects/${slug}`}>{project.name}</Link>
      </Heading>
      {flagship && <p className={styles.flagshipRole}>{project.role}</p>}
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
      {flagship && project.links.length > 0 && (
        <ul className={styles.flagshipLinks}>
          {project.links.map((link) => (
            <li key={link.url}>
              <Link href={link.url}>{link.label}</Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

interface FilterControlsProps {
  options: string[];
  selectedTags: string[];
  /** Unselected tags that can still be added and leave ≥1 project on the page — see `addableTagsFor`. */
  addableTags: ReadonlySet<string>;
}

/**
 * Only a tag that is either selected (its link removes it) or *addable*
 * (some currently-matching project carries it, and the selection is under
 * `MAX_SELECTED_TAGS`) renders as a link. Every other tag is a plain chip:
 * `robots.txt`'s `?tags=` disallow and `rel=nofollow` are advisory, and a
 * crawler that ignores both used to be handed a link to every one of the
 * 2^N combinations from every filtered page. Now the reachable URL space is
 * the (≤3-tag) combinations that actually match a project.
 */
function FilterControls({ options, selectedTags, addableTags }: FilterControlsProps) {
  return (
    <nav aria-label="Filter projects by technology" className={styles.filterNav}>
      {/* issue 252 — a visible label and stated semantics, so the tag row reads
          as a filter (and as an AND filter) to sighted visitors, not just
          to assistive tech via the nav's accessible name. */}
      <p className={styles.filterLabel}>
        Filter by technology
        <span className={styles.filterHint}>
          {" "}
          — selecting several tags narrows to projects matching all of them
        </span>
      </p>
      <ul className={styles.filterList}>
        {options.map((tag) => {
          const selected = selectedTags.includes(tag);
          if (!selected && !addableTags.has(tag)) {
            return (
              <li key={tag}>
                <span
                  className={cx(styles.filterTag, styles.filterTagUnavailable)}
                  aria-disabled="true"
                  title={
                    selectedTags.length >= MAX_SELECTED_TAGS
                      ? `At most ${MAX_SELECTED_TAGS} tags combine — deselect one first`
                      : "No project matches this together with the selected tags"
                  }
                >
                  {tag}
                </span>
              </li>
            );
          }
          return (
            <li key={tag}>
              <Link
                href={toggleTagHref(selectedTags, tag)}
                rel="nofollow"
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
      {/* nofollow on every filter-nav link (the tag toggles above and this
          reset): the tag combinations form a 2^N URL space that AI crawlers
          were walking request-by-request — see robots.ts, which also
          disallows ?tags= URLs outright. */}
      {selectedTags.length > 0 && (
        <Link href="/projects" rel="nofollow">
          Clear filters
        </Link>
      )}
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
  // issue 252 — unknown tags (typos, stale shared links) are called out and
  // ignored rather than silently guaranteeing an empty page; filtering
  // runs on the known tags only.
  const { knownTags: recognisedTags, unknownTags } = partitionSelectedTags(
    parseSelectedTags(params[TAGS_PARAM]),
    options,
  );
  // The UI never produces more than MAX_SELECTED_TAGS (see `FilterControls`),
  // so a longer list only arrives via a hand-built URL — cap it, and say so.
  const { keptTags: knownTags, droppedTags } = capSelectedTags(recognisedTags);
  const filtered = filterProjectsByTags(items, knownTags);
  const addableTags = addableTagsFor(filtered, knownTags, options);

  return (
    <Section>
      <Container>
        <Heading level={1}>Projects</Heading>
        <FilterControls options={options} selectedTags={knownTags} addableTags={addableTags} />
        {droppedTags.length > 0 && (
          <Prose>
            <p>
              At most {MAX_SELECTED_TAGS} tags combine in one filter, so{" "}
              {droppedTags.map((tag) => `"${tag}"`).join(", ")}{" "}
              {droppedTags.length === 1 ? "was" : "were"} ignored from the URL. Deselect a tag to
              make room for another.
            </p>
          </Prose>
        )}
        {unknownTags.length > 0 && (
          <Prose>
            {/* issue 274 — the notice only ever fires for a tag no project
                carries under case-insensitive matching, and says so without
                claiming anything the tag row above contradicts. */}
            <p>
              Ignored {unknownTags.length === 1 ? "an unknown tag" : "unknown tags"} from the URL:{" "}
              {unknownTags.map((tag) => `"${tag}"`).join(", ")} — no project here lists{" "}
              {unknownTags.length === 1 ? "it" : "them"} as a technology. The tags above are the
              full set this page filters by, matched regardless of capitalisation.
            </p>
          </Prose>
        )}
        {filtered.length === 0 ? (
          <Prose>
            {/* issue 252 — the empty state says which filters are active and why
                nothing matched, instead of silently emptying the page. */}
            <p>
              No single project uses all of the selected tags ({knownTags.join(", ")}). Tags combine
              as AND — deselect one to widen the results, or{" "}
              <Link href="/projects">clear the filters</Link>.
            </p>
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
