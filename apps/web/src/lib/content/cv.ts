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
import type { EducationEntry, Profile, Project, Skill } from "@hire-me-mcp/career-data";
import type { CareerDataRepository } from "@hire-me-mcp/core";
import { slugify } from "@hire-me-mcp/core/slugify";
import { sortFeaturedFirst } from "./projects";
import { getCareerDataRepository } from "./repository";

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
  highlights: string[];
  /**
   * The entry's `tech` tags (#299), each resolved to a display name: a
   * matching `dataset.skills` entry's `id` first, then its `aliases`,
   * falling back to the raw tag when no skill claims it. Rendered as the
   * CV's italic "Tech: …" line under each role.
   */
  tech: string[];
  /** Every story whose primary `experienceId` is this role. Present only when `includeStories` is set. */
  stories?: CvStoryView[];
}

/** One proficiency tier's skill names, most-claimed tier first. */
export interface CvSkillGroupView {
  proficiency: Skill["proficiency"];
  names: string[];
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
  profile: Profile;
  experience: CvExperienceItemView[];
  /** Featured-first (#191's content-driven flag), then dataset order — the same ordering `/projects` uses. */
  projects: CvProjectItemView[];
  skillsByProficiency: CvSkillGroupView[];
  education: EducationEntry[];
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
const PROFICIENCY_RANK: Record<Skill["proficiency"], number> = {
  expert: 0,
  proficient: 1,
  familiar: 2,
};

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

function buildSkillGroups(skills: readonly Skill[]): CvSkillGroupView[] {
  const namesByProficiency = new Map<Skill["proficiency"], string[]>();
  for (const skill of skills) {
    const names = namesByProficiency.get(skill.proficiency) ?? [];
    names.push(skill.name);
    namesByProficiency.set(skill.proficiency, names);
  }
  return [...namesByProficiency.entries()]
    .sort(([a], [b]) => PROFICIENCY_RANK[a] - PROFICIENCY_RANK[b])
    .map(([proficiency, names]) => ({ proficiency, names }));
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

  const experience = dataset.experience
    .map((entry) => ({
      company: entry.company,
      role: entry.role,
      startDate: entry.startDate,
      endDate: entry.endDate,
      highlights: entry.highlights.slice(0, maxHighlightsPerRole),
      tech: entry.tech.map((tag) => resolveTechName(tag, dataset.skills)),
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
    }))
    .sort(compareExperienceMostRecentFirst);

  const projects = sortFeaturedFirst(dataset.projects).map((project) => ({
    name: project.name,
    role: project.role,
    summary: project.summary,
    links: project.links,
  }));

  return {
    profile: dataset.profile,
    experience,
    projects,
    skillsByProficiency: buildSkillGroups(dataset.skills),
    education: dataset.education,
    filename: `${slugify(dataset.profile.name)}-cv.pdf`,
  };
}
