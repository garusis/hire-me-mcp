import type { ProjectListItemView } from "../../src/lib/content";

/** The `/projects` shareable filter query param — a comma-separated tag list. */
export const TAGS_PARAM = "tags";

/**
 * The full set of filter options, computed from the projects the content
 * layer actually returns rather than a hardcoded taxonomy — adding a `tech`
 * value to the data adds an option here.
 */
export function computeTagOptions(items: readonly ProjectListItemView[]): string[] {
  const tags = new Set<string>();
  for (const item of items) {
    for (const tag of item.project.tech) {
      tags.add(tag);
    }
  }
  return [...tags].sort();
}

function splitTagList(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/**
 * Parses the `tags` `searchParams` value (Next.js may hand this back as a
 * single string or, for a repeated key, an array of strings) into a
 * de-duplicated tag list.
 */
export function parseSelectedTags(value: string | string[] | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  const raw = Array.isArray(value) ? value : [value];
  return [...new Set(raw.flatMap(splitTagList))];
}

/**
 * Splits the URL-provided tags into ones that exist in the computed option
 * set and ones that don't (issue 252) — an unknown tag (a typo, a stale shared
 * link) is reported and ignored rather than silently emptying the page.
 */
export function partitionSelectedTags(
  selectedTags: readonly string[],
  options: readonly string[],
): { knownTags: string[]; unknownTags: string[] } {
  const optionSet = new Set(options);
  const knownTags: string[] = [];
  const unknownTags: string[] = [];
  for (const tag of selectedTags) {
    (optionSet.has(tag) ? knownTags : unknownTags).push(tag);
  }
  return { knownTags, unknownTags };
}

/** Projects that carry every selected tag (AND semantics); unfiltered when `selectedTags` is empty. */
export function filterProjectsByTags(
  items: readonly ProjectListItemView[],
  selectedTags: readonly string[],
): ProjectListItemView[] {
  if (selectedTags.length === 0) {
    return [...items];
  }
  return items.filter((item) => selectedTags.every((tag) => item.project.tech.includes(tag)));
}

/**
 * The shareable `/projects` URL after toggling `tag` in `selectedTags` —
 * adds it if absent, removes it if present, and drops the query string
 * entirely once no tags remain selected.
 */
export function toggleTagHref(selectedTags: readonly string[], tag: string): string {
  const next = selectedTags.includes(tag)
    ? selectedTags.filter((selected) => selected !== tag)
    : [...selectedTags, tag];
  if (next.length === 0) {
    return "/projects";
  }
  return `/projects?${TAGS_PARAM}=${encodeURIComponent(next.join(","))}`;
}
