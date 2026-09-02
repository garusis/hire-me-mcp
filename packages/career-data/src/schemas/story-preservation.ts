import { z } from "zod";
import { idSchema } from "./common.js";

/**
 * How the #290 audit classified one experience `summary` / `highlights.N`:
 * role-level context that stays in the experience, a concise achievement
 * that stays a short highlight, or a detailed interview-worthy event whose
 * canonical narrative must live in a `CareerStory` before #297 may shorten
 * the prose.
 */
export const STORY_FIELD_CLASSIFICATIONS = [
  "role-context",
  "concise-outcome",
  "detailed-story",
] as const;

/** What #297 is allowed to do with the field once its evidence is preserved. */
export const STORY_PRESERVATION_ACTIONS = [
  "keep",
  "shorten",
  "move-detail-to-story",
  "correct-inconsistency",
] as const;

/** `summary`, or `highlights.<index>` — the only experience fields the audit classifies. */
const fieldLocatorSchema = z
  .string()
  .regex(/^(summary|highlights\.(0|[1-9][0-9]*))$/, "field must be `summary` or `highlights.<n>`");

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
 * One row of the #290 field-to-story preservation map. `strictObject`: this
 * is hand-authored review data, so an unknown key is a typo that must fail
 * loudly rather than silently drop a mapping.
 */
export const storyPreservationEntrySchema = z
  .strictObject({
    /** The experience entry the field belongs to. */
    experienceId: idSchema,
    field: fieldLocatorSchema,
    classification: z.enum(STORY_FIELD_CLASSIFICATIONS),
    /**
     * Canonical stories holding this field's detailed narrative. Omitted
     * (not empty) when no story is involved; required in practice for
     * `detailed-story` fields — the cross-entity lint enforces that.
     */
    storyIds: z.array(idSchema).min(1).optional(),
    action: z.enum(STORY_PRESERVATION_ACTIONS),
    /** Reviewer rationale, boundaries to keep, or why no story exists. */
    note: z.string().min(1).optional(),
  })
  .superRefine((entry, ctx) => {
    for (const duplicate of duplicatesOf(entry.storyIds ?? [])) {
      ctx.addIssue({
        code: "custom",
        path: ["storyIds"],
        message: `storyIds repeats "${duplicate}"`,
      });
    }
  });

export type StoryPreservationEntry = z.infer<typeof storyPreservationEntrySchema>;

/** The whole map: every experience field classified exactly once. */
export const storyPreservationMapSchema = z
  .array(storyPreservationEntrySchema)
  .superRefine((entries, ctx) => {
    const locators = entries.map((entry) => `${entry.experienceId}#${entry.field}`);
    for (const duplicate of duplicatesOf(locators)) {
      ctx.addIssue({
        code: "custom",
        message: `field "${duplicate}" is classified more than once`,
      });
    }
  });

export type StoryPreservationMap = z.infer<typeof storyPreservationMapSchema>;
