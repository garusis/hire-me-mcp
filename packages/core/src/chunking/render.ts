/**
 * Per-entity-type rendering for the career-data chunker (#21): turns one
 * typed domain entity into the plain text, label, optional URL, and
 * filtering metadata `./index.ts`'s `chunkCareerData` needs to build its
 * chunk(s). Each renderer produces a *header + body* pair — the body is
 * often empty (short structured records have no separate long-form prose)
 * — which `./index.ts` normalizes and feeds through `splitLongText`
 * uniformly, so every entity type shares one splitting/budgeting code path
 * regardless of how it renders.
 *
 * Label derivation intentionally mirrors `../citation-builder.ts`'s
 * `lookupEntity` (same "role, company" / "credential, institution"
 * conventions) so a chunk's citation label matches the label a
 * `buildCitation()`-produced `Citation` for the same entity would have.
 * It is not reused directly: `citation-builder.ts` resolves a label by
 * looking an id up in a `CareerDataRepository`'s dataset, whereas the
 * chunker already holds the entity itself while rendering — reusing it
 * here would mean constructing a throwaway repository just to look back up
 * the record already in hand.
 */

import type {
  CareerStory,
  EducationEntry,
  ExperienceEntry,
  Gap,
  Profile,
  Project,
  Recommendation,
  Skill,
  WritingEntry,
} from "@hire-me-mcp/career-data";
import type { ChunkMetadata } from "./types.js";

/** A renderer's output: header/body text plus the citation label, optional url, and filter metadata. */
export interface RenderedEntity {
  /** Short, self-contained context (title/company/dates/tags) — always present, even for a body-less entity. */
  header: string;
  /** Long-form prose, if any (project/writing bodies). Empty string when the entity has none. */
  body: string;
  label: string;
  url?: string;
  metadata: ChunkMetadata;
}

function renderDateRange(startDate: string | undefined, endDate: string | undefined): string {
  if (startDate === undefined && endDate === undefined) {
    return "";
  }
  return `${startDate ?? "?"} – ${endDate ?? "Present"}`;
}

export function renderProfile(profile: Profile): RenderedEntity {
  const contactLines = profile.contacts.map((contact) => `- ${contact.label}: ${contact.url}`);
  const header = [
    `${profile.name} — ${profile.headline}`,
    `Location: ${profile.location} (${profile.availability})`,
  ].join("\n");
  const body = [profile.summary, "", "Contact:", ...contactLines].join("\n");
  return {
    header,
    body,
    label: profile.name,
    metadata: {},
  };
}

export function renderExperience(entry: ExperienceEntry): RenderedEntity {
  const header = [
    `${entry.role}, ${entry.company}`,
    renderDateRange(entry.startDate, entry.endDate),
  ].join("\n");
  const body = [
    entry.summary,
    "",
    "Highlights:",
    ...entry.highlights.map((highlight) => `- ${highlight}`),
    "",
    `Tech: ${entry.tech.join(", ")}`,
  ].join("\n");
  return {
    header,
    body,
    label: `${entry.role}, ${entry.company}`,
    metadata: {
      company: entry.company,
      tags: entry.tech,
      dateFrom: entry.startDate,
      dateTo: entry.endDate,
    },
  };
}

/** Explicit lifecycle-stage line (#300) so a chunk states deployment maturity instead of leaving it to inference. */
function renderProjectStage(stage: Project["stage"]): string | undefined {
  if (stage === undefined) {
    return undefined;
  }
  return stage === "proof-of-concept"
    ? "Stage: proof-of-concept (not deployed to production)"
    : `Stage: ${stage}`;
}

export function renderProject(project: Project): RenderedEntity {
  const header = [
    `${project.name} — ${project.role}`,
    renderProjectStage(project.stage),
    project.summary,
    `Tech: ${project.tech.join(", ")}`,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
  return {
    header,
    body: project.body,
    label: project.name,
    url: project.links[0]?.url,
    metadata: {
      tags: project.tech,
    },
  };
}

export function renderSkill(skill: Skill): RenderedEntity {
  const header = [
    `${skill.name} (${skill.category}, ${skill.proficiency})`,
    skill.aliases.length > 0 ? `Also known as: ${skill.aliases.join(", ")}` : "",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
  const body = ["Evidence:", ...skill.evidence.map((citation) => `- ${citation.label}`)].join("\n");
  return {
    header,
    body,
    label: skill.name,
    metadata: {
      tags: [skill.category, skill.proficiency],
    },
  };
}

export function renderGap(gap: Gap): RenderedEntity {
  const header = `${gap.name} — not claimed`;
  const body = [
    gap.statement,
    gap.relatedSkills.length > 0 ? `\nRelated skills: ${gap.relatedSkills.join(", ")}` : "",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
  return {
    header,
    body,
    label: gap.name,
    metadata: {
      tags: gap.relatedSkills,
    },
  };
}

export function renderEducation(entry: EducationEntry): RenderedEntity {
  const dateRange = renderDateRange(entry.startDate, entry.endDate);
  const header = [`${entry.credential}, ${entry.institution}`, dateRange]
    .filter((line) => line.length > 0)
    .join("\n");
  return {
    header,
    body: "",
    label: `${entry.credential}, ${entry.institution}`,
    metadata: {
      company: entry.institution,
      dateFrom: entry.startDate,
      dateTo: entry.endDate,
    },
  };
}

export function renderRecommendation(entry: Recommendation): RenderedEntity {
  const header = [
    `Recommendation from ${entry.recommenderName} — ${entry.recommenderTitle}`,
    `Relationship: ${entry.relationship}`,
    `Date: ${entry.date}`,
  ].join("\n");
  const body = [entry.text, "", `Verify on LinkedIn: ${entry.sourceUrl}`].join("\n");
  return {
    header,
    body,
    label: `Recommendation from ${entry.recommenderName}`,
    url: entry.sourceUrl,
    metadata: {
      dateFrom: entry.date,
      dateTo: entry.date,
    },
  };
}

/** Turns a lower-kebab controlled competency or retrieval tag into human-readable prose (#292). */
function humanizeKebab(value: string): string {
  return value.replace(/-/g, " ");
}

function renderExperienceLine(entry: ExperienceEntry): string {
  return `${entry.role}, ${entry.company} (${renderDateRange(entry.startDate, entry.endDate)})`;
}

/**
 * Renders a `CareerStory`'s related-experience context (#292/#305 decision
 * 2): explicitly labeled as "Related context" and explicitly stated to not
 * be where the event occurred, so a chunk that mentions a related role for
 * discovery can never be read as relocating the story's event, actions, or
 * results to it.
 */
function renderRelatedContext(relatedExperiences: readonly ExperienceEntry[]): string {
  if (relatedExperiences.length === 0) {
    return "";
  }
  const lines = relatedExperiences.map((entry) => `- ${renderExperienceLine(entry)}`);
  return ["Related context (for discovery only — not where this event occurred):", ...lines].join(
    "\n",
  );
}

/**
 * Renders one `CareerStory` (#289) into retrieval-ready chunk text (#292):
 * title, primary company/role/dates, optional related context distinctly
 * labeled, primary/supporting competencies and retrieval tags in
 * human-readable form, and the labeled situation/task/actions/results/
 * reflection narrative. Reads only `CareerStory`'s own typed fields — the
 * eval-only `retrievalQuestions` list (#295) has no field on this type and
 * is never rendered.
 */
export function renderStory(
  story: CareerStory,
  primaryExperience: ExperienceEntry,
  relatedExperiences: readonly ExperienceEntry[],
): RenderedEntity {
  const header = [
    story.title,
    `Role: ${renderExperienceLine(primaryExperience)}`,
    renderRelatedContext(relatedExperiences),
    `Primary competency: ${humanizeKebab(story.primaryCompetency)}`,
    story.supportingCompetencies.length > 0
      ? `Supporting competencies: ${story.supportingCompetencies.map(humanizeKebab).join(", ")}`
      : "",
    `Retrieval tags: ${story.retrievalTags.map(humanizeKebab).join(", ")}`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  const actionsBlock = ["Actions:", ...story.actions.map((action) => `- ${action}`)].join("\n");
  const resultsBlock = ["Results:", ...story.results.map((result) => `- ${result}`)].join("\n");
  const body = [
    `Situation: ${story.situation}`,
    `Task: ${story.task}`,
    actionsBlock,
    resultsBlock,
    story.reflection === undefined ? "" : `Reflection: ${story.reflection}`,
  ]
    .filter((line) => line.length > 0)
    .join("\n\n");

  return {
    header,
    body,
    label: story.title,
    metadata: {
      company: primaryExperience.company,
      tags: story.retrievalTags,
      dateFrom: primaryExperience.startDate,
      dateTo: primaryExperience.endDate,
    },
  };
}

export function renderWriting(entry: WritingEntry): RenderedEntity {
  const header = [entry.title, `Published: ${entry.publishedDate}`, entry.summary].join("\n");
  return {
    header,
    body: entry.body,
    label: entry.title,
    url: entry.url,
    metadata: {
      dateFrom: entry.publishedDate,
    },
  };
}
