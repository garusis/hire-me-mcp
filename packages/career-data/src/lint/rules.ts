import type { CareerDataset, EntitySource } from "../content/loader.js";
import type { CitableEntityType } from "../schemas/common.js";
import type { StoryPreservationEntry } from "../schemas/story-preservation.js";
import { isKnownTechTag } from "../schemas/tech-tags.js";

/**
 * The cross-entity content lint (#51) — named rules over an already
 * schema-valid {@link CareerDataset} that Zod (#47) cannot express on its
 * own: referential integrity between citations and entities, and the
 * honesty rules (gap discipline) that make the content trustworthy.
 */
export type LintSeverity = "error" | "warning";

/** One reported rule violation: which rule, how severe, and where. */
export interface LintViolation {
  rule: string;
  severity: LintSeverity;
  file: string;
  entityId: string;
  message: string;
}

/** Everything a rule needs to check the content set as a whole. */
export interface LintContext {
  dataset: CareerDataset;
  sources: EntitySource[];
  /** The #290 field-to-story preservation map, when the content set carries one. Absent means nothing to check. */
  storyPreservationMap?: StoryPreservationEntry[];
}

/** A single named, independently addressable lint rule. */
export interface LintRule {
  name: string;
  severity: LintSeverity;
  check(context: LintContext): LintViolation[];
}

/** Builds a `${entityType}:${id}` -> file lookup from a context's sources. */
function fileIndex(sources: EntitySource[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const source of sources) {
    index.set(`${source.entityType}:${source.id}`, source.file);
  }
  return index;
}

/** Looks up the file backing an entity, falling back to a synthetic label if provenance is missing (should not happen for a loaded dataset). */
function fileFor(index: Map<string, string>, entityType: CitableEntityType, id: string): string {
  return index.get(`${entityType}:${id}`) ?? `(unknown: ${entityType})`;
}

/** Every citable entity id, keyed by entity type, resolvable against a Citation. */
function idsByType(dataset: CareerDataset): Record<CitableEntityType, Set<string>> {
  return {
    profile: new Set(dataset.profile ? [dataset.profile.id] : []),
    experience: new Set(dataset.experience.map((entry) => entry.id)),
    project: new Set(dataset.projects.map((project) => project.id)),
    skill: new Set(dataset.skills.map((skill) => skill.id)),
    gap: new Set(dataset.gaps.map((gap) => gap.id)),
    education: new Set(dataset.education.map((entry) => entry.id)),
    writing: new Set(dataset.writing.map((entry) => entry.id)),
    recommendation: new Set(dataset.recommendations.map((entry) => entry.id)),
    story: new Set(dataset.stories.map((story) => story.id)),
  };
}

/** The raw entity object a `${entityType}:${id}` Citation addresses, for fragment resolution. */
function entityByTypeAndId(dataset: CareerDataset): Map<string, unknown> {
  const map = new Map<string, unknown>();
  if (dataset.profile) {
    map.set(`profile:${dataset.profile.id}`, dataset.profile);
  }
  for (const entry of dataset.experience) map.set(`experience:${entry.id}`, entry);
  for (const project of dataset.projects) map.set(`project:${project.id}`, project);
  for (const skill of dataset.skills) map.set(`skill:${skill.id}`, skill);
  for (const gap of dataset.gaps) map.set(`gap:${gap.id}`, gap);
  for (const entry of dataset.education) map.set(`education:${entry.id}`, entry);
  for (const entry of dataset.writing) map.set(`writing:${entry.id}`, entry);
  for (const entry of dataset.recommendations) map.set(`recommendation:${entry.id}`, entry);
  for (const story of dataset.stories) map.set(`story:${story.id}`, story);
  return map;
}

/**
 * Resolves a Citation `fragment` (e.g. `highlights.0`, `summary`) as a
 * dotted path into the cited entity: array indices for numeric segments,
 * object keys otherwise. Returns whether the path exists.
 */
function fragmentResolves(entity: unknown, fragment: string): boolean {
  let current: unknown = entity;
  for (const segment of fragment.split(".")) {
    if (current === null || current === undefined) {
      return false;
    }
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return false;
      }
      current = current[index];
      continue;
    }
    if (typeof current !== "object") {
      return false;
    }
    if (!(segment in (current as Record<string, unknown>))) {
      return false;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current !== undefined;
}

/** `skill-has-evidence` — every Skill has >=1 citation. Schema (#47) already enforces this shape-wise; this is the cross-entity engine's own defense-in-depth check, per #51's scope. */
export const skillHasEvidenceRule: LintRule = {
  name: "skill-has-evidence",
  severity: "error",
  check({ dataset, sources }) {
    const index = fileIndex(sources);
    const violations: LintViolation[] = [];
    for (const skill of dataset.skills) {
      if (skill.evidence.length === 0) {
        violations.push({
          rule: "skill-has-evidence",
          severity: "error",
          file: fileFor(index, "skill", skill.id),
          entityId: skill.id,
          message: `skill "${skill.id}" has no evidence citations`,
        });
      }
    }
    return violations;
  },
};

/** `citation-resolves` — every Citation on a Skill points at an existing entity id (and fragment, if used). */
export const citationResolvesRule: LintRule = {
  name: "citation-resolves",
  severity: "error",
  check({ dataset, sources }) {
    const index = fileIndex(sources);
    const idSets = idsByType(dataset);
    const entities = entityByTypeAndId(dataset);
    const violations: LintViolation[] = [];
    for (const skill of dataset.skills) {
      const file = fileFor(index, "skill", skill.id);
      for (const citation of skill.evidence) {
        if (!idSets[citation.entityType].has(citation.entityId)) {
          violations.push({
            rule: "citation-resolves",
            severity: "error",
            file,
            entityId: skill.id,
            message: `citation on skill "${skill.id}" points at nonexistent ${citation.entityType} id "${citation.entityId}"`,
          });
          continue;
        }
        if (
          citation.fragment !== undefined &&
          !fragmentResolves(
            entities.get(`${citation.entityType}:${citation.entityId}`),
            citation.fragment,
          )
        ) {
          violations.push({
            rule: "citation-resolves",
            severity: "error",
            file,
            entityId: skill.id,
            message: `citation on skill "${skill.id}" has a fragment "${citation.fragment}" that does not resolve on ${citation.entityType} "${citation.entityId}"`,
          });
        }
      }
    }
    return violations;
  },
};

/** Lowercased id, name and aliases for a Skill or Gap — the terms `no-claim-gap-collision` compares. */
function claimTerms(entity: { id: string; name: string; aliases: string[] }): Set<string> {
  return new Set([entity.id, entity.name, ...entity.aliases].map((term) => term.toLowerCase()));
}

/** `no-claim-gap-collision` — no name/alias overlap between a Skill and a Gap (case-insensitive): nothing is simultaneously claimed and disclaimed. */
export const noClaimGapCollisionRule: LintRule = {
  name: "no-claim-gap-collision",
  severity: "error",
  check({ dataset, sources }) {
    const index = fileIndex(sources);
    const skillTerms = new Set<string>();
    for (const skill of dataset.skills) {
      for (const term of claimTerms(skill)) {
        skillTerms.add(term);
      }
    }
    const violations: LintViolation[] = [];
    for (const gap of dataset.gaps) {
      const colliding = [...claimTerms(gap)].filter((term) => skillTerms.has(term));
      if (colliding.length > 0) {
        violations.push({
          rule: "no-claim-gap-collision",
          severity: "error",
          file: fileFor(index, "gap", gap.id),
          entityId: gap.id,
          message: `gap "${gap.id}" shares a claimed term with a skill: ${colliding.join(", ")}`,
        });
      }
    }
    return violations;
  },
};

/** `gap-has-statement` — every Gap has a non-empty (non-whitespace) honest statement. */
export const gapHasStatementRule: LintRule = {
  name: "gap-has-statement",
  severity: "error",
  check({ dataset, sources }) {
    const index = fileIndex(sources);
    const violations: LintViolation[] = [];
    for (const gap of dataset.gaps) {
      if (gap.statement.trim().length === 0) {
        violations.push({
          rule: "gap-has-statement",
          severity: "error",
          file: fileFor(index, "gap", gap.id),
          entityId: gap.id,
          message: `gap "${gap.id}" has no non-empty statement`,
        });
      }
    }
    return violations;
  },
};

/** `gap-related-skills-resolve` — every Gap.relatedSkills entry references an existing Skill id. */
export const gapRelatedSkillsResolveRule: LintRule = {
  name: "gap-related-skills-resolve",
  severity: "error",
  check({ dataset, sources }) {
    const index = fileIndex(sources);
    const skillIds = new Set(dataset.skills.map((skill) => skill.id));
    const violations: LintViolation[] = [];
    for (const gap of dataset.gaps) {
      for (const relatedId of gap.relatedSkills) {
        if (!skillIds.has(relatedId)) {
          violations.push({
            rule: "gap-related-skills-resolve",
            severity: "error",
            file: fileFor(index, "gap", gap.id),
            entityId: gap.id,
            message: `gap "${gap.id}" relatedSkills references nonexistent skill id "${relatedId}"`,
          });
        }
      }
    }
    return violations;
  },
};

/**
 * `story-experience-resolves` — every CareerStory's `experienceId` and each
 * `relatedExperienceIds` entry references an existing ExperienceEntry id
 * (#289). The schema already guarantees related ids are distinct and never
 * the primary; only the cross-entity resolution has to live here. Each
 * unresolved id is its own violation so a report names every broken link.
 */
export const storyExperienceResolvesRule: LintRule = {
  name: "story-experience-resolves",
  severity: "error",
  check({ dataset, sources }) {
    const index = fileIndex(sources);
    const experienceIds = new Set(dataset.experience.map((entry) => entry.id));
    const violations: LintViolation[] = [];
    for (const story of dataset.stories) {
      const references = [
        { field: "experienceId", id: story.experienceId },
        ...(story.relatedExperienceIds ?? []).map((id) => ({ field: "relatedExperienceIds", id })),
      ];
      for (const { field, id } of references) {
        if (!experienceIds.has(id)) {
          violations.push({
            rule: "story-experience-resolves",
            severity: "error",
            file: fileFor(index, "story", story.id),
            entityId: story.id,
            message: `story "${story.id}" ${field} references nonexistent experience id "${id}"`,
          });
        }
      }
    }
    return violations;
  },
};

const STORY_PRESERVATION_MAP_FILE = "story-preservation-map.json";

/** Whether `field` (`summary` or `highlights.<n>`) exists on `entry`. */
function experienceFieldExists(entry: CareerDataset["experience"][number], field: string): boolean {
  if (field === "summary") {
    return true;
  }
  const index = Number(field.slice("highlights.".length));
  return Number.isInteger(index) && index >= 0 && index < entry.highlights.length;
}

/** Whether `story` occurred during, or is related to, `experienceId` — the only associations a mapping may rely on (#305 decision 2). */
function storyAssociatedWith(
  story: CareerDataset["stories"][number],
  experienceId: string,
): boolean {
  return (
    story.experienceId === experienceId || (story.relatedExperienceIds ?? []).includes(experienceId)
  );
}

function checkPreservationEntry(
  entry: StoryPreservationEntry,
  dataset: CareerDataset,
): LintViolation[] {
  const violation = (message: string): LintViolation => ({
    rule: "story-preservation-map-resolves",
    severity: "error",
    file: STORY_PRESERVATION_MAP_FILE,
    entityId: `${entry.experienceId}#${entry.field}`,
    message,
  });
  const violations: LintViolation[] = [];
  const experience = dataset.experience.find((candidate) => candidate.id === entry.experienceId);
  if (experience === undefined) {
    violations.push(violation(`references nonexistent experience id "${entry.experienceId}"`));
  } else if (!experienceFieldExists(experience, entry.field)) {
    violations.push(
      violation(`field "${entry.field}" does not exist on experience "${entry.experienceId}"`),
    );
  }
  for (const storyId of entry.storyIds ?? []) {
    const story = dataset.stories.find((candidate) => candidate.id === storyId);
    if (story === undefined) {
      violations.push(violation(`references nonexistent story id "${storyId}"`));
    } else if (!storyAssociatedWith(story, entry.experienceId)) {
      violations.push(
        violation(
          `story "${storyId}" is not associated with experience "${entry.experienceId}" (neither its primary nor a related experience) — attribution never transfers`,
        ),
      );
    }
  }
  const needsStory =
    entry.classification === "detailed-story" || entry.action === "move-detail-to-story";
  if (needsStory && (entry.storyIds ?? []).length === 0) {
    const reason =
      entry.classification === "detailed-story" ? "detailed-story" : "move-detail-to-story";
    violations.push(
      violation(
        `${reason} field has no story: author and approve the canonical story before this prose may be shortened or removed (#290)`,
      ),
    );
  }
  return violations;
}

/**
 * `story-preservation-map-resolves` — the #290 evidence-preservation gate
 * over `story-preservation-map.json`. Every entry's experience and field
 * must exist, every named story must exist and be associated with that
 * experience (primary or related — a mapping never transfers an event to
 * another role, #305 decision 2), and every field classified
 * `detailed-story` or slated to `move-detail-to-story` must name at least
 * one story. Deliberately *not* an `experience-has-story` rule: coverage
 * is evidence-driven and an experience may have no story and no detailed
 * field at all (#305 decision 1). An absent map is nothing to check;
 * completeness of a present map is `story-preservation-map-complete`.
 */
export const storyPreservationMapResolvesRule: LintRule = {
  name: "story-preservation-map-resolves",
  severity: "error",
  check({ dataset, storyPreservationMap = [] }) {
    return storyPreservationMap.flatMap((entry) => checkPreservationEntry(entry, dataset));
  },
};

/**
 * `story-preservation-map-complete` — the other half of the #290
 * evidence-preservation gate. Once a content set carries a
 * `story-preservation-map.json`, every experience `summary` and
 * `highlights.<n>` must be classified in it: a row that is missing (never
 * written, or removed) is an error-severity violation in `lint:content`
 * itself, not only in the Vitest real-content invariant. This is still not
 * an `experience-has-story` rule — a field may be classified `role-context`
 * or `concise-outcome` with no story at all (#305 decision 1); only the
 * *classification* must be complete. An absent map is nothing to check.
 */
export const storyPreservationMapCompleteRule: LintRule = {
  name: "story-preservation-map-complete",
  severity: "error",
  check({ dataset, storyPreservationMap }) {
    if (storyPreservationMap === undefined) {
      return [];
    }
    const classified = new Set(
      storyPreservationMap.map((entry) => `${entry.experienceId}#${entry.field}`),
    );
    const violations: LintViolation[] = [];
    for (const experience of dataset.experience) {
      const fields = ["summary", ...experience.highlights.map((_, index) => `highlights.${index}`)];
      for (const field of fields) {
        const locator = `${experience.id}#${field}`;
        if (!classified.has(locator)) {
          violations.push({
            rule: "story-preservation-map-complete",
            severity: "error",
            file: STORY_PRESERVATION_MAP_FILE,
            entityId: locator,
            message: `experience "${experience.id}" field "${field}" is not classified in ${STORY_PRESERVATION_MAP_FILE}: every summary and highlight must be mapped before #297 may shorten or remove it (#290)`,
          });
        }
      }
    }
    return violations;
  },
};

/** Flags every `tech` tag outside the controlled vocabulary on one collection of `{ id, tech }` entities (experience entries or projects). */
function findUnknownTechTags(
  entries: Array<{ id: string; tech: string[] }>,
  index: Map<string, string>,
  entityType: CitableEntityType,
): LintViolation[] {
  const violations: LintViolation[] = [];
  for (const entry of entries) {
    const file = fileFor(index, entityType, entry.id);
    for (const tag of entry.tech) {
      if (!isKnownTechTag(tag)) {
        violations.push({
          rule: "tag-in-vocabulary",
          severity: "error",
          file,
          entityId: entry.id,
          message: `${entityType} "${entry.id}" uses tag "${tag}" outside the controlled vocabulary`,
        });
      }
    }
  }
  return violations;
}

/** Flags every non-`"practice"`-category skill whose id is outside the controlled tag vocabulary. */
function findUnknownTechnologySkillIds(
  skills: CareerDataset["skills"],
  index: Map<string, string>,
): LintViolation[] {
  const violations: LintViolation[] = [];
  for (const skill of skills) {
    if (skill.category !== "practice" && !isKnownTechTag(skill.id)) {
      violations.push({
        rule: "tag-in-vocabulary",
        severity: "error",
        file: fileFor(index, "skill", skill.id),
        entityId: skill.id,
        message: `skill "${skill.id}" is not in the controlled tag vocabulary`,
      });
    }
  }
  return violations;
}

/**
 * `tag-in-vocabulary` — every technology tag across experience/project.tech
 * and technology-skill ids is a member of the controlled vocabulary
 * (`TECH_TAGS`). Skills whose `category` is `"practice"` are soft
 * skills/practices, not technologies — exempt by construction rather than a
 * hardcoded id list.
 */
export const tagInVocabularyRule: LintRule = {
  name: "tag-in-vocabulary",
  severity: "error",
  check({ dataset, sources }) {
    const index = fileIndex(sources);
    return [
      ...findUnknownTechTags(dataset.experience, index, "experience"),
      ...findUnknownTechTags(dataset.projects, index, "project"),
      ...findUnknownTechnologySkillIds(dataset.skills, index),
    ];
  },
};

/** `unique-ids` — every entity id is unique across the whole content set, not just within its own file/collection. */
export const uniqueIdsRule: LintRule = {
  name: "unique-ids",
  severity: "error",
  check({ sources }) {
    const byId = new Map<string, EntitySource[]>();
    for (const source of sources) {
      const existing = byId.get(source.id) ?? [];
      existing.push(source);
      byId.set(source.id, existing);
    }
    const violations: LintViolation[] = [];
    for (const [id, occurrences] of byId) {
      if (occurrences.length > 1) {
        for (const occurrence of occurrences) {
          violations.push({
            rule: "unique-ids",
            severity: "error",
            file: occurrence.file,
            entityId: id,
            message: `id "${id}" is used by ${occurrences.length} entities: ${occurrences
              .map((o) => `${o.entityType} (${o.file})`)
              .join(", ")}`,
          });
        }
      }
    }
    return violations;
  },
};

/** Reports duplicate (case-insensitive) aliases within one named collection (e.g. all Skills, or all Gaps). */
function findDuplicateAliases(
  entities: Array<{ id: string; aliases: string[] }>,
  index: Map<string, string>,
  entityType: CitableEntityType,
): LintViolation[] {
  const seen = new Map<string, string>();
  const violations: LintViolation[] = [];
  for (const entity of entities) {
    for (const alias of entity.aliases) {
      const key = alias.toLowerCase();
      const owner = seen.get(key);
      if (owner !== undefined && owner !== entity.id) {
        violations.push({
          rule: "unique-aliases",
          severity: "error",
          file: fileFor(index, entityType, entity.id),
          entityId: entity.id,
          message: `alias "${alias}" on ${entityType} "${entity.id}" duplicates the alias already used by "${owner}"`,
        });
      } else {
        seen.set(key, entity.id);
      }
    }
  }
  return violations;
}

/** `unique-aliases` — every alias is unique (case-insensitive) within Skills, and separately within Gaps. */
export const uniqueAliasesRule: LintRule = {
  name: "unique-aliases",
  severity: "error",
  check({ dataset, sources }) {
    const index = fileIndex(sources);
    return [
      ...findDuplicateAliases(dataset.skills, index, "skill"),
      ...findDuplicateAliases(dataset.gaps, index, "gap"),
    ];
  },
};

/**
 * `no-orphan-entities` — flags entities nothing can reach: experience,
 * project, education and writing entries with zero incoming citations.
 *
 * Severity is `"warning"`, not `"error"`: unlike the other rules, an orphan
 * is not necessarily a mistake — e.g. an education credential or an
 * as-yet-unclaimed project write-up can legitimately have no skill citing
 * it yet (the real content set has exactly this: two education credentials
 * no skill cites). This surfaces the gap for a human to judge rather than
 * blocking the build. `profile`, `gap` and `skill` are roots by design
 * (nothing is expected to cite them) and are not checked; neither are
 * `recommendation` and `story` entries, which are narrative evidence served
 * by their own tools rather than something a skill must cite.
 */
export const noOrphanEntitiesRule: LintRule = {
  name: "no-orphan-entities",
  severity: "warning",
  check({ dataset, sources }) {
    const index = fileIndex(sources);
    const cited = new Set<string>();
    for (const skill of dataset.skills) {
      for (const citation of skill.evidence) {
        cited.add(`${citation.entityType}:${citation.entityId}`);
      }
    }
    const violations: LintViolation[] = [];
    const checkCollection = (entityType: CitableEntityType, entries: Array<{ id: string }>) => {
      for (const entry of entries) {
        if (!cited.has(`${entityType}:${entry.id}`)) {
          violations.push({
            rule: "no-orphan-entities",
            severity: "warning",
            file: fileFor(index, entityType, entry.id),
            entityId: entry.id,
            message: `${entityType} "${entry.id}" is not cited as evidence by any skill`,
          });
        }
      }
    };
    checkCollection("experience", dataset.experience);
    checkCollection("project", dataset.projects);
    checkCollection("education", dataset.education);
    checkCollection("writing", dataset.writing);
    return violations;
  },
};

/** Every named rule required by #51's scope, in the order they run. */
export const ALL_RULES: LintRule[] = [
  skillHasEvidenceRule,
  citationResolvesRule,
  noClaimGapCollisionRule,
  gapHasStatementRule,
  gapRelatedSkillsResolveRule,
  storyExperienceResolvesRule,
  storyPreservationMapResolvesRule,
  storyPreservationMapCompleteRule,
  tagInVocabularyRule,
  uniqueIdsRule,
  uniqueAliasesRule,
  noOrphanEntitiesRule,
];

/** Runs every rule and concatenates every violation — the full report, not just the first failure. */
export function runRules(context: LintContext): LintViolation[] {
  return ALL_RULES.flatMap((rule) => rule.check(context));
}
