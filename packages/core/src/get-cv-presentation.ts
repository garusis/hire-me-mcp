/**
 * `getCvPresentation(repository, options?)` — the CV presentation layer
 * exposed as a domain service (#315, follow-up to #309): the overlay
 * `cv-overrides.json` merged onto the canonical dataset via
 * {@link buildCvPresentation}, so a caller — the public MCP's
 * `get-cv-presentation` tool — never has to merge anything itself. Every
 * entry carries its canonical `id` (so a client can cross-reference
 * `get-experience` / `list-skills`), and every citation points at that
 * canonical entity, tagged with a `cv-overrides` fragment suffix
 * wherever the displayed wording actually came from the overlay rather
 * than being a plain canonical pass-through.
 */

import type { CvOverrides } from "@hire-me-mcp/career-data";
import { buildCitation } from "./citation-builder.js";
import {
  buildCvPresentation,
  type CvPresentationEducationItem,
  type CvPresentationExperienceItem,
  type CvPresentationProjectItem,
  type CvPresentationSkillGroup,
  type CvVariant,
} from "./cv-presentation.js";
import type { CareerDataRepository } from "./repository.js";
import { type Citation, createDomainResult, type DomainResult } from "./result.js";

export type { CvVariant };

/** One experience entry in the tool's response — {@link CvPresentationExperienceItem} minus its internal `bulletsSource`. */
export type CvPresentationExperienceEntry = Omit<CvPresentationExperienceItem, "bulletsSource">;

/** One project entry in the tool's response — {@link CvPresentationProjectItem} minus its internal `summarySource`. */
export type CvPresentationProjectEntry = Omit<CvPresentationProjectItem, "summarySource">;

export type {
  CvPresentationEducationItem as CvPresentationEducationEntry,
  CvPresentationSkillEntry,
  CvPresentationSkillGroup,
} from "./cv-presentation.js";

/** The `get-cv-presentation` response payload: the CV view model the web renderer also consumes, minus internal source-tracking fields. */
export interface GetCvPresentationData {
  variant: CvVariant;
  headline: string;
  summary: string;
  timezoneLine?: string;
  experience: CvPresentationExperienceEntry[];
  projects: CvPresentationProjectEntry[];
  skillGroups: CvPresentationSkillGroup[];
  education: CvPresentationEducationItem[];
}

export interface GetCvPresentationOptions {
  /** Which selectable CV audience to build. Defaults to `"general"`. */
  variant?: CvVariant;
  /**
   * The CV-only overlay to apply. Omitted (the default) loads the real
   * `cv-overrides.json`. Tests that need a specific, hermetic overlay (or
   * no overlay at all) should pass one explicitly — same convention as
   * {@link buildCvPresentation}.
   */
  overrides?: CvOverrides;
}

/** Suffixes a base fragment name with `.cv-overrides` when `source` is `"cv-overrides"`, else returns it unchanged. */
function fragmentFor(base: string, source: "cv-overrides" | "canonical"): string {
  return source === "cv-overrides" ? `${base}.cv-overrides` : base;
}

/**
 * Returns the CV presentation for `variant` (general by default), with
 * every entry's canonical `id` and a `{ data, citations }` envelope whose
 * citations point at the canonical entity each piece of displayed text
 * resolves to — `cv-overrides`-suffixed wherever the overlay supplied the
 * actual wording. Throws {@link CvProfileNotFoundError} (re-exported from
 * `cv-presentation.js`) if no profile has been authored — never returns a
 * subject-less result.
 */
export function getCvPresentation(
  repository: CareerDataRepository,
  options: GetCvPresentationOptions = {},
): DomainResult<GetCvPresentationData> {
  const presentation = buildCvPresentation(repository, {
    variant: options.variant,
    ...("overrides" in options ? { overrides: options.overrides } : {}),
  });

  const citations: Citation[] = [];

  citations.push(
    buildCitation(repository, "profile", presentation.profile.id, {
      fragment: fragmentFor("headline", presentation.headlineSource),
    }),
  );
  citations.push(
    buildCitation(repository, "profile", presentation.profile.id, {
      fragment: fragmentFor("summary", presentation.summarySource),
    }),
  );

  const experience: CvPresentationExperienceEntry[] = presentation.experience.map((item) => {
    citations.push(
      buildCitation(repository, "experience", item.id, {
        fragment: fragmentFor("bullets", item.bulletsSource),
      }),
    );
    const { bulletsSource: _bulletsSource, ...entry } = item;
    return entry;
  });

  const projects: CvPresentationProjectEntry[] = presentation.projects.map((project) => {
    citations.push(
      buildCitation(repository, "project", project.id, {
        fragment: fragmentFor("summary", project.summarySource),
      }),
    );
    const { summarySource: _summarySource, ...entry } = project;
    return entry;
  });

  for (const group of presentation.skillGroups) {
    for (const skill of group.skills) {
      citations.push(buildCitation(repository, "skill", skill.id));
    }
  }

  for (const entry of presentation.education) {
    citations.push(
      buildCitation(repository, "education", entry.id, {
        ...(entry.displayLine === undefined ? {} : { fragment: "line.cv-overrides" }),
      }),
    );
  }

  const data: GetCvPresentationData = {
    variant: presentation.variant,
    headline: presentation.headline,
    summary: presentation.summary,
    ...(presentation.timezoneLine === undefined ? {} : { timezoneLine: presentation.timezoneLine }),
    experience,
    projects,
    skillGroups: presentation.skillGroups,
    education: presentation.education,
  };

  return createDomainResult(data, citations);
}
