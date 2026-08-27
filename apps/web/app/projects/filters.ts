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

/**
 * Comparison key for a tag (issue 274). The site matches tags exactly the
 * way the MCP server does (issue 226, `get-experience`/`list-projects`):
 * case-insensitively, so `TypeScript`, `typescript` and `TYPESCRIPT` all
 * select the canonical `typescript` tag. Before this, the site was the only
 * surface that disagreed — a title-cased tag in a shared or agent-built URL
 * silently fell through to the unknown-tag path and returned the whole
 * unfiltered list.
 */
function tagKey(tag: string): string {
  return tag.trim().toLowerCase();
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
 *
 * Matching is case-insensitive (issue 274), and every recognised tag comes
 * back in its **canonical** casing — the value the content layer actually
 * carries — so everything downstream (the filter itself, the selected-chip
 * highlighting, the shareable URLs `toggleTagHref` builds) works off one
 * spelling regardless of how the URL spelled it. Duplicate spellings of the
 * same tag (`?tags=TypeScript,typescript`) collapse to a single entry.
 */
export function partitionSelectedTags(
  selectedTags: readonly string[],
  options: readonly string[],
): { knownTags: string[]; unknownTags: string[] } {
  const canonicalByKey = new Map(options.map((option) => [tagKey(option), option]));
  const knownTags: string[] = [];
  const unknownTags: string[] = [];
  for (const tag of selectedTags) {
    const canonical = canonicalByKey.get(tagKey(tag));
    if (canonical === undefined) {
      if (!unknownTags.includes(tag)) {
        unknownTags.push(tag);
      }
    } else if (!knownTags.includes(canonical)) {
      knownTags.push(canonical);
    }
  }
  return { knownTags, unknownTags };
}

/**
 * Projects that carry every selected tag (AND semantics); unfiltered when
 * `selectedTags` is empty. Tags are compared case-insensitively (issue 274),
 * matching the MCP server's tag filters.
 */
export function filterProjectsByTags(
  items: readonly ProjectListItemView[],
  selectedTags: readonly string[],
): ProjectListItemView[] {
  if (selectedTags.length === 0) {
    return [...items];
  }
  const selectedKeys = selectedTags.map(tagKey);
  return items.filter((item) => {
    const itemKeys = new Set(item.project.tech.map(tagKey));
    return selectedKeys.every((key) => itemKeys.has(key));
  });
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
