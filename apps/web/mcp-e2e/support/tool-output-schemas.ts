/**
 * Structural output validation for each career tool's `structuredContent`.
 *
 * Every tool now declares its own Zod `outputSchema` (#242), so `tools/list`
 * advertises one and the MCP SDK client validates `structuredContent`
 * automatically. These schemas are deliberately kept as a SECOND, independent
 * statement of the same contract: they're built here from the real
 * `@hire-me-mcp/career-data` schemas (`profileSchema`,
 * `experienceEntrySchema`, `projectSchema`, `citationSchema` — the actual
 * shape every domain-service `DomainResult` is built from, see
 * `packages/core/src/result.ts`) wrapped in the `{ data, citations }`
 * envelope from `lib/mcp/envelope.ts`. A tool whose declared `outputSchema`
 * drifted from the data it actually serves would pass its own self-check and
 * still fail here. Structural only — never an exact career content string,
 * which is out of scope per #49.
 */
import {
  careerStorySchema,
  citationSchema,
  educationEntrySchema,
  experienceEntrySchema,
  profileSchema,
  projectSchema,
  recommendationSchema,
  skillSchema,
  writingEntrySchema,
} from "@hire-me-mcp/career-data";
import { z } from "zod";

const citationsSchema = z.array(citationSchema);

/** `get-profile` result: a single Profile plus citations. */
export const getProfileOutputSchema = z.object({
  data: profileSchema,
  citations: citationsSchema,
});

/** `get-experience` result: a list of ExperienceEntry plus citations. */
export const getExperienceOutputSchema = z.object({
  data: z.array(experienceEntrySchema),
  citations: citationsSchema,
});

/**
 * `search-projects` result: ranked `{ project, score, matches }` entries.
 * `matches` (a match explanation) is intentionally left as `z.unknown()`
 * here — its exact shape is a `packages/core` implementation detail this
 * suite deliberately doesn't pin down; only its presence as an array is
 * asserted structurally alongside the well-formed `project`/`score`.
 */
export const searchProjectsOutputSchema = z.object({
  data: z.array(
    z.object({
      project: projectSchema,
      score: z.number(),
      matches: z.array(z.unknown()),
    }),
  ),
  citations: citationsSchema,
});

/**
 * `get-skill-evidence` result: the discriminated union outcome
 * (`claimed` / `not-claimed` / `unknown`) plus citations. Mirrors
 * `packages/core/src/get-skill-evidence.ts`'s `SkillEvidenceOutcome`
 * without importing it directly (apps/web reads career content only
 * through `src/lib/content/`, and this suite validates the wire shape, not
 * the internal type).
 */
export const getSkillEvidenceOutputSchema = z.object({
  data: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("claimed"),
      // The embedded skill record carries NO evidence array of its own —
      // the outcome-level `evidence` is the one canonical copy (#245).
      // `.strict()` pins that: a payload resurrecting `skill.evidence`
      // fails this suite.
      skill: z.strictObject({
        id: z.string().min(1),
        name: z.string().min(1),
        aliases: z.array(z.string()),
        category: z.string().min(1),
        proficiency: z.enum(["familiar", "proficient", "expert"]),
      }),
      evidence: citationsSchema,
    }),
    z.object({
      kind: z.literal("not-claimed"),
      gap: z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        aliases: z.array(z.string()),
        statement: z.string().min(1),
        relatedSkills: z.array(z.string()),
      }),
      relatedSkills: z.array(
        z.object({
          skill: z.object({ id: z.string().min(1), name: z.string().min(1) }).passthrough(),
          evidence: citationsSchema,
        }),
      ),
    }),
    z.object({
      kind: z.literal("unknown"),
      term: z.string().min(1),
    }),
  ]),
  citations: citationsSchema,
});

/** `list-education` result (#211): a list of EducationEntry plus citations. */
export const listEducationOutputSchema = z.object({
  data: z.array(educationEntrySchema),
  citations: citationsSchema,
});

/** `list-skills` result (#212): full Skill records (evidence citations resolved) plus citations. */
export const listSkillsOutputSchema = z.object({
  data: z.array(skillSchema),
  citations: citationsSchema,
});

/**
 * `list-gaps` result (#213): authored gap fields with `relatedSkills`
 * resolved from bare skill ids into Citation records.
 */
export const listGapsOutputSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      aliases: z.array(z.string()),
      statement: z.string().min(1),
      relatedSkills: citationsSchema,
    }),
  ),
  citations: citationsSchema,
});

/** `list-projects` result (#214): full Project records (incl. body) plus citations. */
export const listProjectsOutputSchema = z.object({
  data: z.array(projectSchema),
  citations: citationsSchema,
});

/** `list-writing` result (#215): a list of WritingEntry plus citations (currently empty corpus). */
export const listWritingOutputSchema = z.object({
  data: z.array(writingEntrySchema),
  citations: citationsSchema,
});

/**
 * `list-recommendations` result (#190): full Recommendation records —
 * verbatim `text` plus both LinkedIn verification URLs — and citations.
 * `.strict()` on each entry pins the wire shape: the tool is a thin
 * adapter that must not add, rename, or drop an authored field.
 */
export const listRecommendationsOutputSchema = z.object({
  data: z.array(recommendationSchema.strict()),
  citations: citationsSchema,
});

/** Compact parent-role context on a `list-career-stories` item — never the full entry (#291). */
const storyExperienceContextSchema = z
  .object({
    id: z.string().min(1),
    company: z.string().min(1),
    role: z.string().min(1),
    startDate: z.string().regex(/^\d{4}-\d{2}$/),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
  })
  .strict();

/**
 * `list-career-stories` result (#293): the complete `CareerStory` record
 * (strict, so the adapter cannot add, rename, or drop an authored field —
 * and no eval-only retrieval questions can leak onto the wire), compact
 * primary and related role context, and one `story` citation per item.
 */
export const listCareerStoriesOutputSchema = z.object({
  data: z.array(
    z
      .object({
        story: careerStorySchema,
        primaryExperience: storyExperienceContextSchema,
        relatedExperiences: z.array(storyExperienceContextSchema),
        citation: citationSchema.extend({ entityType: z.literal("story") }),
      })
      .strict(),
  ),
  citations: z.array(citationSchema.extend({ entityType: z.literal("story") })),
});
