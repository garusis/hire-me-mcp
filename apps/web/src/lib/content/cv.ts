/**
 * Typed accessor building the CV view model (#35): one flattened, print-
 * ready shape assembled entirely from `packages/career-data` via the
 * repository seam, the same pattern `gaps.ts`/`writing.ts` use — no career
 * fact here is anything other than a pass-through of dataset fields.
 *
 * The overlay-merge logic that used to live here now lives in
 * `packages/core`'s `buildCvPresentation()` (#315, follow-up to #309), so
 * both this web renderer and the public MCP's `get-cv-presentation` tool
 * read the exact same projection instead of each re-deriving it. This
 * module is now a thin wrapper: it calls `buildCvPresentation()`, then
 * reshapes its (richer, id/source-carrying) result down to the `CvView`
 * shape this file has always exposed — dropping the ids and `*Source`
 * fields no web consumer has ever needed, renaming `bullets` back to
 * `highlights`, and folding `skillGroups[].skills` down to plain
 * display-name strings — and adds the one genuinely web-only field,
 * `filename`. Every existing `CvView` consumer (`render-cv-html.ts`, the
 * CV PDF generator, `generate-llms.ts`) is unaffected.
 */

import "server-only";
import type {
  CvOverrides,
  CvVariant,
  EducationEntry,
  Profile,
  Project,
} from "@hire-me-mcp/career-data";
import {
  buildCvPresentation,
  type CareerDataRepository,
  type CvPresentationStoryView,
  CvProfileNotFoundError,
} from "@hire-me-mcp/core";
import { slugify } from "@hire-me-mcp/core/slugify";
import { getCareerDataRepository } from "./repository";

export type { CvVariant };
export { CvProfileNotFoundError };

/**
 * One behavioral story attached to a role (#309 stage 1): the same
 * situation/task/actions/results shape as `CareerStory`, minus the
 * competency/retrieval metadata that has no place on a printed CV.
 */
export type CvStoryView = CvPresentationStoryView;

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
  /**
   * CV-only (#309 stage 3 second review, item 5): when the overlay sets
   * `keepTogether` for this role, the CV renders its `.entry` block with
   * `break-inside: avoid` so a short entry never splits across the page
   * boundary. Undefined for every role the overlay doesn't flag.
   */
  keepTogether?: boolean;
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

/**
 * Builds the CV view model from `repository`'s dataset via
 * `packages/core`'s `buildCvPresentation()`. Throws
 * {@link CvProfileNotFoundError} if no profile has been authored.
 */
export function getCvView(
  repository: CareerDataRepository = getCareerDataRepository(),
  options: GetCvViewOptions = {},
): CvView {
  const presentation = buildCvPresentation(repository, {
    maxHighlightsPerRole: options.maxHighlightsPerRole,
    includeSummary: options.includeSummary,
    includeStories: options.includeStories,
    variant: options.variant,
    ...("overrides" in options ? { overrides: options.overrides } : {}),
  });

  const experience: CvExperienceItemView[] = presentation.experience.map((item) => ({
    company: item.company,
    role: item.role,
    startDate: item.startDate,
    endDate: item.endDate,
    highlights: item.bullets,
    tech: item.tech,
    ...(item.summary === undefined ? {} : { summary: item.summary }),
    ...(item.stories === undefined ? {} : { stories: item.stories }),
    ...(item.compactLine === undefined ? {} : { compactLine: item.compactLine }),
    ...(item.keepTogether === undefined ? {} : { keepTogether: item.keepTogether }),
  }));

  const projects: CvProjectItemView[] = presentation.projects.map((project) => ({
    name: project.name,
    role: project.role,
    summary: project.summary,
    links: project.links,
  }));

  const skillGroups: CvSkillCategoryGroupView[] = presentation.skillGroups.map((group) => ({
    category: group.category,
    label: group.label,
    names: group.skills.map((skill) => skill.name),
  }));

  return {
    profile: presentation.profile,
    variant: presentation.variant,
    headline: presentation.headline,
    summary: presentation.summary,
    ...(presentation.timezoneLine === undefined ? {} : { timezoneLine: presentation.timezoneLine }),
    experience,
    projects,
    skillGroups,
    education: presentation.education,
    filename: `${slugify(presentation.profile.name)}-cv.pdf`,
  };
}
