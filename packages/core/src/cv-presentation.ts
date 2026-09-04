/**
 * `buildCvPresentation(repository, options?)` — the shared CV-overlay
 * merge (#315, follow-up to #309): the overlay `cv-overrides.json` merged
 * onto the canonical dataset into one view model, so `apps/web`'s
 * `getCvView()` and the public MCP's `get-cv-presentation` tool
 * (`get-cv-presentation.ts`) both read the exact same projection instead
 * of each re-deriving it. This module owns the merge logic that used to
 * live solely in `apps/web/src/lib/content/cv.ts`; `getCvView()` is now a
 * thin wrapper around it (see that file's doc comment).
 *
 * Every field that can come from either the canonical dataset or the
 * CV-only overlay also reports which one it came from (`headlineSource`,
 * `bulletsSource`, `summarySource`) — `"cv-overrides"` or `"canonical"` —
 * so a citation-building caller (the MCP tool) can mark overlay-sourced
 * wording distinctly from a canonical pass-through, per #315's contract.
 * `apps/web`'s thin wrapper drops these source fields; its `CvView` shape
 * (and behavior) is unchanged from before this move.
 */

import type {
  CvOverrides,
  CvVariant,
  EducationEntry,
  Profile,
  Project,
  Skill,
} from "@hire-me-mcp/career-data";
import { loadCvOverrides, resolveDefaultContentDir } from "@hire-me-mcp/career-data";
import type { CareerDataRepository } from "./repository.js";

export type { CvVariant };

/** Whether a piece of CV-displayed text/wording came from the CV-only overlay or is a plain canonical pass-through. */
export type CvPresentationSource = "cv-overrides" | "canonical";

/**
 * One behavioral story attached to a role (#309 stage 1): the same
 * situation/task/actions/results shape as `CareerStory`, minus the
 * competency/retrieval metadata that has no place on a printed CV.
 */
export interface CvPresentationStoryView {
  title: string;
  situation: string;
  task: string;
  actions: string[];
  results: string[];
}

/**
 * One experience entry in the CV presentation: the canonical `id` (#315,
 * so a caller can cross-reference `get-experience`) plus authored
 * company/role/dates, a capped/overridden highlight ("bullet") list, and a
 * pre-formatted `displayLine` (`"<role>, <company> (<period>)"`) so a
 * consumer never has to format the date range itself.
 */
export interface CvPresentationExperienceItem {
  id: string;
  company: string;
  role: string;
  startDate: string;
  endDate: string | undefined;
  /** The role's full authored summary. Present only when `includeSummary` is set. */
  summary?: string;
  /**
   * The role's highlights as shown on the CV: the overlay's per-variant
   * `bullets` (#309 stage 3) when `cv-overrides.json` has an entry for
   * this role, else the canonical `highlights` capped at
   * {@link BuildCvPresentationOptions.maxHighlightsPerRole}. Either way,
   * this never changes the canonical `ExperienceEntry.highlights` — a
   * bullet replacement is CV-only wording.
   */
  bullets: string[];
  /** Whether {@link bullets} came from the overlay or is the canonical (capped) `highlights`. */
  bulletsSource: CvPresentationSource;
  /**
   * The entry's `tech` tags (#299) plus any overlay `techAdditions`
   * (#309 stage 3), each resolved to a display name.
   */
  tech: string[];
  /** Every story whose primary `experienceId` is this role. Present only when `includeStories` is set. */
  stories?: CvPresentationStoryView[];
  /** CV-only (#309 stage 3, action 11): collapses this role into one dated "Earlier experience" line. */
  compactLine?: string;
  /** CV-only (#309 stage 3 second review, item 5): render this role's block with `break-inside: avoid`. */
  keepTogether?: boolean;
  /**
   * A pre-formatted, human-readable one-liner (`"<role>, <company>
   * (<Mon YYYY> – <Mon YYYY|Present>)"`) so a consumer never has to derive
   * a date-range string itself (#315). Computed from the canonical
   * company/role/dates regardless of `compactLine` — the two are
   * independent presentation fields.
   */
  displayLine: string;
}

/** One skill in a {@link CvPresentationSkillGroup}, carrying its canonical id (#315) alongside its CV display name. */
export interface CvPresentationSkillEntry {
  id: string;
  name: string;
}

/**
 * One `category`'s skills on the CV (#309 stage 3, action 5): grouped by
 * `skills.json`'s existing `category` field, ordered per the overlay's
 * variant-specific `groupOrder`, with the overlay's `categoryLabels`/
 * `displayNames` applied — canonical skill names and categories are
 * unchanged.
 */
export interface CvPresentationSkillGroup {
  category: string;
  label: string;
  skills: CvPresentationSkillEntry[];
}

/** One education entry as shown on the CV: the canonical entry plus an optional overlay display line (#309 stage 3, action 17). */
export interface CvPresentationEducationItem extends EducationEntry {
  /** Replaces the rendered institution/credential line when set; the canonical `credential` above is unchanged. */
  displayLine?: string;
}

/**
 * One project trimmed for the CV (#232): canonical `id` (#315) plus name,
 * role, one-line summary (overlay-overridable) and the authored links.
 */
export interface CvPresentationProjectItem {
  id: string;
  name: string;
  role: string;
  summary: string;
  /** Whether {@link summary} came from the overlay's `projects[].summary` or is the canonical `Project.summary`. */
  summarySource: CvPresentationSource;
  links: Project["links"];
}

export interface CvPresentation {
  /** The canonical Profile, unchanged by any CV-only override — see `headline`/`summary`/`timezoneLine` below for the CV's actual displayed text. */
  profile: Profile;
  /** Which selectable CV audience this presentation was built for. Defaults to `"general"`. */
  variant: CvVariant;
  /** The CV's displayed headline: the overlay's per-variant `profile.headline` override when present, else `profile.headline` unchanged. */
  headline: string;
  /** Whether {@link headline} came from the overlay or is the canonical `profile.headline`. */
  headlineSource: CvPresentationSource;
  /** The CV's displayed summary: the overlay's per-variant `profile.summary` override when present, else `profile.summary` unchanged. */
  summary: string;
  /** Whether {@link summary} came from the overlay or is the canonical `profile.summary`. */
  summarySource: CvPresentationSource;
  /** CV-only time-zone/availability clause, shown after `profile.location`. Undefined when the overlay sets none. */
  timezoneLine?: string;
  experience: CvPresentationExperienceItem[];
  /** Featured-first, then dataset order, filtered by the overlay's `showOnCv` — a project with no overlay entry defaults to shown. */
  projects: CvPresentationProjectItem[];
  /** Skills grouped by `category`, ordered/labeled/filtered per the overlay for `variant`. */
  skillGroups: CvPresentationSkillGroup[];
  education: CvPresentationEducationItem[];
}

export interface BuildCvPresentationOptions {
  /**
   * Highlights kept per role, most-recent-authored-first. Defaults to 2.
   * Pass `Number.POSITIVE_INFINITY` to keep every authored highlight.
   */
  maxHighlightsPerRole?: number;
  /** Includes each role's full authored summary. Defaults to false. */
  includeSummary?: boolean;
  /** Includes every behavioral story whose primary `experienceId` is the role. Defaults to false. */
  includeStories?: boolean;
  /** Which selectable CV audience to build. Defaults to `"general"`. */
  variant?: CvVariant;
  /**
   * The CV-only overlay to apply. Omitted (the default) loads the real
   * `cv-overrides.json` from `@hire-me-mcp/career-data`'s own default
   * content directory. Tests that need a specific, hermetic overlay (or no
   * overlay at all) should pass one explicitly.
   */
  overrides?: CvOverrides;
}

/** Thrown when no profile has been authored — a CV with no subject is not a renderable state. */
export class CvProfileNotFoundError extends Error {
  constructor() {
    super("career-data: no profile authored — buildCvPresentation() has nothing to build");
    this.name = "CvProfileNotFoundError";
  }
}

const DEFAULT_MAX_HIGHLIGHTS_PER_ROLE = 2;

const MAX_DATE = "9999-12";

function compareExperienceMostRecentFirst(
  a: { startDate: string; endDate: string | undefined },
  b: { startDate: string; endDate: string | undefined },
): number {
  if (a.startDate !== b.startDate) {
    return a.startDate < b.startDate ? 1 : -1;
  }
  const aEnd = a.endDate ?? MAX_DATE;
  const bEnd = b.endDate ?? MAX_DATE;
  if (aEnd !== bEnd) {
    return aEnd < bEnd ? 1 : -1;
  }
  return 0;
}

/**
 * Featured (flagship, issue #191) projects first, then the rest, each
 * group in dataset order. Mirrors `apps/web/src/lib/content/projects.ts`'s
 * `sortFeaturedFirst` — kept as a small local copy here rather than an
 * import, since that module is web-only (`server-only`) and this package
 * must stay framework-free (see `.claude/rules/architecture-boundaries.md`).
 */
function sortFeaturedFirst(projects: readonly Project[]): Project[] {
  return [
    ...projects.filter((project) => project.featured === true),
    ...projects.filter((project) => project.featured !== true),
  ];
}

/**
 * Resolves one `tech` tag (#299) to a display name: a `dataset.skills`
 * entry whose `id` matches the tag first, then one whose `aliases`
 * includes it, falling back to the raw tag when no skill claims it.
 */
function resolveTechName(tag: string, skills: readonly Skill[]): string {
  const byId = skills.find((skill) => skill.id === tag);
  if (byId !== undefined) {
    return byId.name;
  }
  const byAlias = skills.find((skill) => skill.aliases.includes(tag));
  if (byAlias !== undefined) {
    return byAlias.name;
  }
  return tag;
}

/**
 * Loads the real `cv-overrides.json` once per process and memoizes it. An
 * absent overlay file resolves to `undefined`, never a throw —
 * {@link buildCvPresentation} then falls back to every field's canonical
 * value.
 */
const NOT_LOADED = Symbol("cv-overrides-not-loaded");
let cachedDefaultOverrides: CvOverrides | undefined | typeof NOT_LOADED = NOT_LOADED;

function defaultOverrides(): CvOverrides | undefined {
  if (cachedDefaultOverrides === NOT_LOADED) {
    cachedDefaultOverrides = loadCvOverrides(resolveDefaultContentDir());
  }
  return cachedDefaultOverrides;
}

interface ResolvedText {
  value: string;
  source: CvPresentationSource;
}

/** `{ general, ai }` -> the text for `variant`, falling back to the other variant's text, then to `fallback`, tagged with its source. */
function resolveVariantText(
  value: { general?: string; ai?: string } | undefined,
  variant: CvVariant,
  fallback: string,
): ResolvedText {
  const overlayText = value?.[variant] ?? value?.general ?? value?.ai;
  return overlayText === undefined
    ? { value: fallback, source: "canonical" }
    : { value: overlayText, source: "cv-overrides" };
}

interface ResolvedBullets {
  value: string[];
  source: CvPresentationSource;
}

/**
 * `{ general, ai }` -> the bullet list for `variant`, falling back to the
 * other variant's bullets, then to `fallback` (the canonical highlights,
 * capped), tagged with its source.
 */
function resolveVariantBullets(
  value: { general?: string[]; ai?: string[] } | undefined,
  variant: CvVariant,
  fallback: string[],
): ResolvedBullets {
  const overlayBullets = value?.[variant] ?? value?.general ?? value?.ai;
  return overlayBullets === undefined
    ? { value: fallback, source: "canonical" }
    : { value: overlayBullets, source: "cv-overrides" };
}

function buildSkillGroups(
  skills: readonly Skill[],
  overrides: CvOverrides["skills"] | undefined,
  variant: CvVariant,
): CvPresentationSkillGroup[] {
  const excludeIds = new Set(overrides?.excludeIds ?? []);
  const displayNames = overrides?.displayNames ?? {};
  const categoryLabels = overrides?.categoryLabels ?? {};
  const groupOrder = overrides?.groupOrder[variant] ?? [];
  const categoryOverrides = overrides?.categoryOverrides ?? {};

  const entriesByCategory = new Map<string, CvPresentationSkillEntry[]>();
  for (const skill of skills) {
    if (excludeIds.has(skill.id)) {
      continue;
    }
    const category = categoryOverrides[skill.id] ?? skill.category;
    const entries = entriesByCategory.get(category) ?? [];
    const displayName = displayNames[skill.id] ?? skill.name;
    if (!entries.some((entry) => entry.name === displayName)) {
      entries.push({ id: skill.id, name: displayName });
    }
    entriesByCategory.set(category, entries);
  }

  const orderedCategories = [
    ...groupOrder.filter((category) => entriesByCategory.has(category)),
    ...[...entriesByCategory.keys()].filter((category) => !groupOrder.includes(category)).sort(),
  ];

  return orderedCategories.map((category) => ({
    category,
    label: categoryLabels[category] ?? category,
    skills: entriesByCategory.get(category) ?? [],
  }));
}

/** `YYYY-MM` -> `Mon YYYY` (e.g. `2021-06` -> `Jun 2021`); an unparseable value passes through unchanged. */
function formatMonthYear(yearMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (match === null) {
    return yearMonth;
  }
  const [, year, month] = match;
  const monthIndex = Number(month) - 1;
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthName = monthNames[monthIndex];
  return monthName === undefined ? yearMonth : `${monthName} ${year}`;
}

/** `startDate`/`endDate` -> a human period, `"Mon YYYY – Mon YYYY"`. An open end renders `Present`. */
function formatPeriod(startDate: string, endDate: string | undefined): string {
  const start = formatMonthYear(startDate);
  if (endDate === undefined) {
    return `${start} – Present`;
  }
  return `${start} – ${formatMonthYear(endDate)}`;
}

/** Builds the pre-formatted `displayLine` for one experience item — see {@link CvPresentationExperienceItem.displayLine}. */
function buildExperienceDisplayLine(
  role: string,
  company: string,
  startDate: string,
  endDate: string | undefined,
): string {
  return `${role}, ${company} (${formatPeriod(startDate, endDate)})`;
}

/**
 * Builds the CV presentation from `repository`'s dataset, merging in the
 * CV-only overlay (real by default, or `options.overrides` for a hermetic
 * test double). Throws {@link CvProfileNotFoundError} if no profile has
 * been authored.
 */
export function buildCvPresentation(
  repository: CareerDataRepository,
  options: BuildCvPresentationOptions = {},
): CvPresentation {
  const dataset = repository.getDataset();
  if (dataset.profile === undefined) {
    throw new CvProfileNotFoundError();
  }
  const maxHighlightsPerRole = options.maxHighlightsPerRole ?? DEFAULT_MAX_HIGHLIGHTS_PER_ROLE;
  const includeSummary = options.includeSummary ?? false;
  const includeStories = options.includeStories ?? false;
  const variant = options.variant ?? "general";
  const overrides = "overrides" in options ? options.overrides : defaultOverrides();

  const experienceOverridesById = new Map(
    (overrides?.experience ?? []).map((entry) => [entry.id, entry]),
  );

  const experience: CvPresentationExperienceItem[] = dataset.experience
    .map((entry) => {
      const entryOverride = experienceOverridesById.get(entry.id);
      const techAdditions = entryOverride?.techAdditions ?? [];
      const techExcludeIds = new Set(entryOverride?.techExcludeIds ?? []);
      const resolvedBullets = resolveVariantBullets(
        entryOverride?.bullets,
        variant,
        entry.highlights.slice(0, maxHighlightsPerRole),
      );
      return {
        id: entry.id,
        company: entry.company,
        role: entry.role,
        startDate: entry.startDate,
        endDate: entry.endDate,
        bullets: resolvedBullets.value,
        bulletsSource: resolvedBullets.source,
        tech: [...entry.tech.filter((tag) => !techExcludeIds.has(tag)), ...techAdditions].map(
          (tag) => resolveTechName(tag, dataset.skills),
        ),
        displayLine: buildExperienceDisplayLine(
          entry.role,
          entry.company,
          entry.startDate,
          entry.endDate,
        ),
        ...(entryOverride?.compactLine !== undefined
          ? { compactLine: entryOverride.compactLine }
          : {}),
        ...(entryOverride?.keepTogether !== undefined
          ? { keepTogether: entryOverride.keepTogether }
          : {}),
        ...(includeSummary ? { summary: entry.summary } : {}),
        ...(includeStories
          ? {
              stories: dataset.stories
                .filter((story) => story.experienceId === entry.id)
                .map((story) => ({
                  title: story.title,
                  situation: story.situation,
                  task: story.task,
                  actions: story.actions,
                  results: story.results,
                })),
            }
          : {}),
      };
    })
    .sort(compareExperienceMostRecentFirst);

  const projectOverridesById = new Map(
    (overrides?.projects ?? []).map((entry) => [entry.id, entry]),
  );
  const projects: CvPresentationProjectItem[] = sortFeaturedFirst(dataset.projects)
    .filter((project) => projectOverridesById.get(project.id)?.showOnCv ?? true)
    .map((project) => {
      const projectOverride = projectOverridesById.get(project.id);
      const excludeLinkLabels = new Set(projectOverride?.excludeLinkLabels ?? []);
      return {
        id: project.id,
        name: project.name,
        role: project.role,
        summary: projectOverride?.summary ?? project.summary,
        summarySource: projectOverride?.summary === undefined ? "canonical" : "cv-overrides",
        links: project.links.filter((projectLink) => !excludeLinkLabels.has(projectLink.label)),
      } satisfies CvPresentationProjectItem;
    });

  const educationOverridesById = new Map(
    (overrides?.education ?? []).map((entry) => [entry.id, entry]),
  );
  const education: CvPresentationEducationItem[] = dataset.education
    .filter((entry) => (educationOverridesById.get(entry.id)?.showOnCv ?? true) !== false)
    .map((entry) => {
      const displayLine = educationOverridesById.get(entry.id)?.line;
      return displayLine === undefined ? entry : { ...entry, displayLine };
    });

  const headline = resolveVariantText(
    overrides?.profile.headline,
    variant,
    dataset.profile.headline,
  );
  const summary = resolveVariantText(overrides?.profile.summary, variant, dataset.profile.summary);

  return {
    profile: dataset.profile,
    variant,
    headline: headline.value,
    headlineSource: headline.source,
    summary: summary.value,
    summarySource: summary.source,
    timezoneLine: overrides?.profile.timezoneLine,
    experience,
    projects,
    skillGroups: buildSkillGroups(dataset.skills, overrides?.skills, variant),
    education,
  };
}
