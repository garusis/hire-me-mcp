import { z } from "zod";
import { idSchema } from "./common.js";
import { competencySchema, isCompetency } from "./competency.js";

/** Upper bound on `supportingCompetencies` per story (#289). */
const MAX_SUPPORTING_COMPETENCIES = 5;
/** Upper bound on `retrievalTags` per story (#289, #305 decision 3). */
const MAX_RETRIEVAL_TAGS = 15;

/**
 * A discovery facet: lower-kebab-case, and never a controlled competency —
 * competencies are the only behavioral taxonomy, so a tag that spells one
 * would double-weight it in retrieval (#305 decision 3). The loader fails
 * on a bad tag rather than normalizing it: the persisted JSON is the
 * canonical, already-normalized form.
 */
const retrievalTagSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "retrieval tag must be lower-kebab-case (e.g. client-recovery)",
  )
  .refine((tag) => !isCompetency(tag), {
    message: "retrieval tag must not equal a controlled competency",
  });

function duplicatesOf(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates];
}

/**
 * A structured, citable behavioral story (#288/#289): one concrete event,
 * told as situation / task / actions / results, that happened during exactly
 * one primary experience record.
 *
 * `strictObject` rather than `object`: a story is authored by hand, and an
 * unknown key is far more likely a typo (or, specifically, a
 * `retrievalQuestions` list that belongs in the #295 eval manifest and must
 * never be indexed as story text) than something to silently drop.
 */
export const careerStorySchema = z
  .strictObject({
    id: idSchema,
    /** The single primary experience where the event occurred. */
    experienceId: idSchema,
    /**
     * Optional additional experience ids that aid discovery. Omitted (not
     * empty) when unused. A related role never changes where the event
     * occurred or transfers actions, authority, or outcomes to that role
     * (#305 decision 2).
     */
    relatedExperienceIds: z.array(idSchema).min(1).optional(),
    /** Short human-readable description of the event. */
    title: z.string().min(1),
    /** The one behavior this story primarily demonstrates. */
    primaryCompetency: competencySchema,
    /** Zero to five further behaviors the story also evidences; never the primary. */
    supportingCompetencies: z.array(competencySchema).max(MAX_SUPPORTING_COMPETENCIES),
    /** Context, constraint, and why the event mattered. */
    situation: z.string().min(1),
    /** The responsibility or goal Marcos owned. */
    task: z.string().min(1),
    /** Ordered, concrete actions Marcos took. */
    actions: z.array(z.string().min(1)).min(1),
    /** Ordered, honest qualitative or quantitative outcomes. */
    results: z.array(z.string().min(1)).min(1),
    /** Optional lesson, changed approach, or interview follow-up insight. */
    reflection: z.string().min(1).optional(),
    /**
     * One to fifteen distinct discovery facets — technologies, vendors,
     * domains, situations, methods, outcomes, or recruiter vocabulary.
     */
    retrievalTags: z.array(retrievalTagSchema).min(1).max(MAX_RETRIEVAL_TAGS),
  })
  .superRefine((story, ctx) => {
    const related = story.relatedExperienceIds ?? [];
    for (const duplicate of duplicatesOf(related)) {
      ctx.addIssue({
        code: "custom",
        path: ["relatedExperienceIds"],
        message: `relatedExperienceIds repeats "${duplicate}"`,
      });
    }
    if (related.includes(story.experienceId)) {
      ctx.addIssue({
        code: "custom",
        path: ["relatedExperienceIds"],
        message: `relatedExperienceIds must not contain the primary experienceId "${story.experienceId}"`,
      });
    }

    const supporting = story.supportingCompetencies ?? [];
    for (const duplicate of duplicatesOf(supporting)) {
      ctx.addIssue({
        code: "custom",
        path: ["supportingCompetencies"],
        message: `supportingCompetencies repeats "${duplicate}"`,
      });
    }
    if (supporting.includes(story.primaryCompetency)) {
      ctx.addIssue({
        code: "custom",
        path: ["supportingCompetencies"],
        message: `supportingCompetencies must not contain the primaryCompetency "${story.primaryCompetency}"`,
      });
    }

    for (const duplicate of duplicatesOf(story.retrievalTags ?? [])) {
      ctx.addIssue({
        code: "custom",
        path: ["retrievalTags"],
        message: `retrievalTags repeats "${duplicate}"`,
      });
    }
  });

export type CareerStory = z.infer<typeof careerStorySchema>;
