/**
 * Typed accessor building the CV view model (#35): one flattened, print-
 * ready shape assembled entirely from `packages/career-data` via the
 * repository seam, the same pattern `gaps.ts`/`writing.ts` use — no career
 * fact here is anything other than a pass-through of dataset fields.
 *
 * `packages/core` has no dedicated "build a CV" service (a CV is a
 * presentation concern — section order, highlight trimming, filename — not
 * a new domain query), so this reads the dataset via `repository.getDataset()`
 * directly, exactly like `gaps.ts` does, and accepts an injectable
 * repository so tests (and the guard test in `apps/web/lib/cv/render-cv-html.test.ts`)
 * can exercise it against fixture data with no filesystem access.
 */

import "server-only";
import type {
  CvOverrides,
  CvVariant,
  EducationEntry,
  Profile,
  Project,
  Skill,
} from "@hire-me-mcp/career-data";
import { loadCvOverrides, resolveDefaultContentDir } from "@hire-me-mcp/career-data";
import type { CareerDataRepository } from "@hire-me-mcp/core";
import { slugify } from "@hire-me-mcp/core/slugify";
import { sortFeaturedFirst } from "./projects";
import { getCareerDataRepository } from "./repository";

export type { CvVariant };

/**
 * One behavioral story attached to a role (#309 stage 1): the same
 * situation/task/actions/results shape as `CareerStory`, minus the
 * competency/retrieval metadata that has no place on a printed CV.
 */
export interface CvStoryView {
  title: string;
  situation: string;
  task: string;
  actions: string[];
  results: string[];
}

/**
 * One experience entry trimmed for the CV: authored company/role/dates plus
 * a capped highlight list. `summary` and `stories` are only populated when
 * {@link GetCvViewOptions.includeSummary}/`includeStories` are set (#309
 * stage 1's "full" projection) — the default (web) projection omits both,
 * exactly as before.
 */
export interface CvExperienceItemView {
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
   * {@link GetCvViewOptions.maxHighlightsPerRole}. Either way, this never
   * changes the canonical `ExperienceEntry.highlights` — a bullet
   * replacement is CV-only wording.
   */
  highlights: string[];
  /**
   * The entry's `tech` tags (#299) plus any overlay `techAdditions`
   * (#309 stage 3), each resolved to a display name: a matching
   * `dataset.skills` entry's `id` first, then its `aliases`, falling back
   * to the raw tag when no skill claims it. Rendered as the CV's italic
   * "Tech: …" line under each role.
   */
  tech: string[];
  /** Every story whose primary `experienceId` is this role. Present only when `includeStories` is set. */
  stories?: CvStoryView[];
  /**
   * CV-only (#309 stage 3, action 11): when `cv-overrides.json` gives this
   * role a `compactLine`, the CV renders it as one dated line under
   * "Earlier experience" instead of a full entry with bullets. Undefined
   * for every role rendered as a full entry.
   */
  compactLine?: string;
}

/**
 * One `category`'s skill names on the CV (#309 stage 3, action 5): grouped
 * by `skills.json`'s existing `category` field rather than proficiency,
 * ordered per the overlay's variant-specific `groupOrder`, with the
 * overlay's `categoryLabels`/`displayNames` applied — canonical skill
 * names and categories are unchanged.
 */
export interface CvSkillCategoryGroupView {
  category: string;
  label: string;
  names: string[];
}

/** One education entry as shown on the CV: the canonical entry plus an optional overlay display line (#309 stage 3, action 17). */
export interface CvEducationItemView extends EducationEntry {
  /** Replaces the rendered institution/credential line when set; the canonical `credential` above is unchanged. */
  displayLine?: string;
}

/**
 * One project trimmed for the CV (#232): name, role, one-line summary and
 * the authored links (which for the flagship project include the public
 * MCP endpoint) — no long-form `body` prose on a 1–2 page document.
 */
export interface CvProjectItemView {
  name: string;
  role: string;
  summary: string;
  links: Project["links"];
}

export interface CvView {
  /** The canonical Profile, unchanged by any CV-only override — see `headline`/`summary`/`timezoneLine` below for the CV's actual displayed text. */
  profile: Profile;
  /** Which selectable CV audience this view was built for (#309 stage 3, open question 2). Defaults to `"general"`. */
  variant: CvVariant;
  /** The CV's displayed headline: the overlay's per-variant `profile.headline` override when present, else `profile.headline` unchanged. */
  headline: string;
  /** The CV's displayed summary: the overlay's per-variant `profile.summary` override when present, else `profile.summary` unchanged. */
  summary: string;
  /** CV-only time-zone/availability clause (#309 stage 3, action 12), shown after `profile.location`. Undefined when the overlay sets none. */
  timezoneLine?: string;
  experience: CvExperienceItemView[];
  /** Featured-first (#191's content-driven flag), then dataset order, filtered by the overlay's `showOnCv` (#309 stage 3, action 7) — a project with no overlay entry defaults to shown. */
  projects: CvProjectItemView[];
  /** Skills grouped by `category` (#309 stage 3, action 5), ordered/labeled/filtered per the overlay for `variant`. */
  skillGroups: CvSkillCategoryGroupView[];
  education: CvEducationItemView[];
  /** Deterministic, human-meaningful download filename derived from `profile.name` — never hardcoded. */
  filename: string;
}

export interface GetCvViewOptions {
  /**
   * Highlights kept per role, most-recent-authored-first. Defaults to 2 to
   * keep the CV within its 1–2 page bound. Pass `Number.POSITIVE_INFINITY`
   * (#309 stage 1's "full" projection) to keep every authored highlight.
   */
  maxHighlightsPerRole?: number;
  /** Includes each role's full authored summary. Defaults to false — the web CV doesn't show it today. */
  includeSummary?: boolean;
  /**
   * Includes every behavioral story whose primary `experienceId` is the
   * role, complete (title/situation/task/actions/results). Defaults to
   * false: the default projection is exactly what it was before #309 —
   * `render-cv-html.test.ts`'s story-leakage guard (#296) still exercises
   * this default and stays green unchanged.
   */
  includeStories?: boolean;
  /** Which selectable CV audience to build (#309 stage 3, open question 2). Defaults to `"general"` — the default PDF. */
  variant?: CvVariant;
  /**
   * The CV-only overlay to apply. Omitted (the default) loads the real
   * `cv-overrides.json` from the package's own default content directory,
   * mirroring the `repository` parameter's own real-content default.
   * Tests that need a specific, hermetic overlay (or no overlay at all)
   * should pass one explicitly.
   */
  overrides?: CvOverrides;
}

/** Thrown when no profile has been authored — a CV with no subject is not a renderable state. */
export class CvProfileNotFoundError extends Error {
  constructor() {
    super("career-data: no profile authored — getCvView() has nothing to render");
    this.name = "CvProfileNotFoundError";
  }
}

const DEFAULT_MAX_HIGHLIGHTS_PER_ROLE = 2;

const MAX_DATE = "9999-12";

function compareExperienceMostRecentFirst(
  a: CvExperienceItemView,
  b: CvExperienceItemView,
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

/** Ranks a proficiency tier for CV ordering — expert first, then proficient, then familiar. */
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
 * Loads the real `cv-overrides.json` once per process and memoizes it,
 * exactly like `repository.ts` memoizes the real content repository. An
 * absent overlay file (a content set with nothing overridden yet) resolves
 * to `undefined`, never a throw — {@link getCvView} then falls back to
 * every field's canonical value.
 */
const NOT_LOADED = Symbol("cv-overrides-not-loaded");
let cachedDefaultOverrides: CvOverrides | undefined | typeof NOT_LOADED = NOT_LOADED;

function defaultOverrides(): CvOverrides | undefined {
  if (cachedDefaultOverrides === NOT_LOADED) {
    cachedDefaultOverrides = loadCvOverrides(resolveDefaultContentDir());
  }
  return cachedDefaultOverrides;
}

/** `{ general, ai }` -> the text for `variant`, falling back to the other variant's text, then to `fallback`. */
function resolveVariantText(
  value: { general?: string; ai?: string } | undefined,
  variant: CvVariant,
  fallback: string,
): string {
  if (value === undefined) {
    return fallback;
  }
  return value[variant] ?? value.general ?? value.ai ?? fallback;
}

function buildSkillGroups(
  skills: readonly Skill[],
  overrides: CvOverrides["skills"] | undefined,
  variant: CvVariant,
): CvSkillCategoryGroupView[] {
  const excludeIds = new Set(overrides?.excludeIds ?? []);
  const displayNames = overrides?.displayNames ?? {};
  const categoryLabels = overrides?.categoryLabels ?? {};
  const groupOrder = overrides?.groupOrder[variant] ?? [];

  const namesByCategory = new Map<string, string[]>();
  for (const skill of skills) {
    if (excludeIds.has(skill.id)) {
      continue;
    }
    const names = namesByCategory.get(skill.category) ?? [];
    const displayName = displayNames[skill.id] ?? skill.name;
    if (!names.includes(displayName)) {
      names.push(displayName);
    }
    namesByCategory.set(skill.category, names);
  }

  const orderedCategories = [
    ...groupOrder.filter((category) => namesByCategory.has(category)),
    ...[...namesByCategory.keys()].filter((category) => !groupOrder.includes(category)).sort(),
  ];

  return orderedCategories.map((category) => ({
    category,
    label: categoryLabels[category] ?? category,
    names: namesByCategory.get(category) ?? [],
  }));
}

/**
 * Builds the CV view model from `repository`'s dataset. Throws
 * {@link CvProfileNotFoundError} if no profile has been authored.
 */
export function getCvView(
  repository: CareerDataRepository = getCareerDataRepository(),
  options: GetCvViewOptions = {},
): CvView {
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

  const experience = dataset.experience
    .map((entry) => {
      const entryOverride = experienceOverridesById.get(entry.id);
      const variantBullets = entryOverride?.bullets?.[variant];
      const techAdditions = entryOverride?.techAdditions ?? [];
      return {
        company: entry.company,
        role: entry.role,
        startDate: entry.startDate,
        endDate: entry.endDate,
        highlights: variantBullets ?? entry.highlights.slice(0, maxHighlightsPerRole),
        tech: [...entry.tech, ...techAdditions].map((tag) => resolveTechName(tag, dataset.skills)),
        ...(entryOverride?.compactLine !== undefined
          ? { compactLine: entryOverride.compactLine }
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

  const projectShowOnCvById = new Map(
    (overrides?.projects ?? []).map((entry) => [entry.id, entry.showOnCv]),
  );
  const projects = sortFeaturedFirst(dataset.projects)
    .filter((project) => projectShowOnCvById.get(project.id) ?? true)
    .map((project) => ({
      name: project.name,
      role: project.role,
      summary: project.summary,
      links: project.links,
    }));

  const educationOverridesById = new Map(
    (overrides?.education ?? []).map((entry) => [entry.id, entry]),
  );
  const education = dataset.education
    .filter((entry) => (educationOverridesById.get(entry.id)?.showOnCv ?? true) !== false)
    .map((entry) => {
      const displayLine = educationOverridesById.get(entry.id)?.line;
      return displayLine === undefined ? entry : { ...entry, displayLine };
    });

  return {
    profile: dataset.profile,
    variant,
    headline: resolveVariantText(overrides?.profile.headline, variant, dataset.profile.headline),
    summary: resolveVariantText(overrides?.profile.summary, variant, dataset.profile.summary),
    timezoneLine: overrides?.profile.timezoneLine,
    experience,
    projects,
    skillGroups: buildSkillGroups(dataset.skills, overrides?.skills, variant),
    education,
    filename: `${slugify(dataset.profile.name)}-cv.pdf`,
  };
}
