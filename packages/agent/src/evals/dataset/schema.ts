/**
 * Zod schema for the eval suite's dataset (#72): a small, curated,
 * version-controlled set of cases in `./cases.ts`, each with a question,
 * its category, and the gap-honesty direction it probes (see
 * `../scorers/gap-honesty.ts`). `evalDatasetSchema` is the array-level
 * schema — it additionally rejects duplicate ids, since the runner and
 * report both key per-case results by `id`.
 *
 * `category` and `gapHonestyDirection` are required to agree — a
 * `"grounded"` case always probes the anti-over-refusal (`"claimed"`)
 * direction, a `"gap"` case always probes the honest-gap (`"gap"`)
 * direction, and `"off-topic"`/`"injection"` cases aren't about a claimed
 * skill either way, so their direction is `"n/a"`. This is enforced here,
 * not left to convention, so a malformed case (the wrong direction for its
 * category) is a schema validation failure a test catches, per issue #72's
 * "a test rejects malformed cases" acceptance criterion.
 */

import { z } from "zod";

/** The four dataset categories — see the issue's scope for what each probes. */
export const evalCaseCategorySchema = z.enum(["grounded", "gap", "off-topic", "injection"]);
export type EvalCaseCategory = z.infer<typeof evalCaseCategorySchema>;

/** Which gap-honesty direction (`../scorers/gap-honesty.ts`) a case probes, or `"n/a"` for categories that don't probe either direction. */
export const gapHonestyDirectionSchema = z.enum(["claimed", "gap", "n/a"]);
export type EvalCaseGapHonestyDirection = z.infer<typeof gapHonestyDirectionSchema>;

/**
 * Which tool-call routing a case expects (#75, epic #6) — orthogonal to
 * `category`/`gapHonestyDirection`, since routing is about WHICH tool
 * answers the question, not the shape of the expected answer.
 * `"search-career"` asserts the agent's tool-call trace includes the
 * semantic-search tool (a fuzzy/cross-cutting question, or a genuinely
 * absent topic worth checking against the full corpus, not just the
 * curated `gaps.json` list). `"deterministic-only"` asserts it does NOT —
 * an exact, structured question one of `get-experience`/`search-projects`/
 * `get-skill-evidence` already answers precisely. Optional: most existing
 * cases don't assert routing at all. See `../scorers/tool-routing.ts`.
 */
export const expectedToolCallSchema = z.enum(["search-career", "deterministic-only"]);
export type EvalCaseExpectedToolCall = z.infer<typeof expectedToolCallSchema>;

const KEBAB_CASE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isValidRegexSource(source: string): boolean {
  try {
    new RegExp(source, "i");
    return true;
  } catch {
    return false;
  }
}

const regexSourceSchema = z
  .string()
  .min(1)
  .refine(isValidRegexSource, { message: "must be a valid regular-expression source" });

/**
 * Content assertions on the answer text (#300, #295's factual boundaries):
 * `mustMatch` patterns that a correct answer has to contain (e.g. that the
 * document-extraction work was a "proof of concept") and `mustNotMatch`
 * patterns that a correct answer must never contain (a withdrawn metric, a
 * claim transferred to the wrong employer). Each entry is a
 * case-insensitive regular-expression source. Scored by
 * `../scorers/answer-assertions.ts`; a block must assert at least one
 * thing.
 */
export const answerAssertionsSchema = z
  .object({
    mustMatch: z.array(regexSourceSchema).optional(),
    mustNotMatch: z.array(regexSourceSchema).optional(),
  })
  .strict()
  .refine((value) => (value.mustMatch?.length ?? 0) + (value.mustNotMatch?.length ?? 0) > 0, {
    message: "answerAssertions must declare at least one mustMatch or mustNotMatch pattern",
  });
export type EvalCaseAnswerAssertions = z.infer<typeof answerAssertionsSchema>;

const CATEGORY_DIRECTION_PAIRS: Readonly<Record<EvalCaseCategory, EvalCaseGapHonestyDirection>> = {
  grounded: "claimed",
  gap: "gap",
  "off-topic": "n/a",
  injection: "n/a",
};

/** One eval case: a question, its category, and the direction it probes gap honesty. */
export const evalCaseSchema = z
  .object({
    id: z.string().regex(KEBAB_CASE_REGEX, "id must be kebab-case"),
    category: evalCaseCategorySchema,
    question: z.string().min(1),
    gapHonestyDirection: gapHonestyDirectionSchema,
    expectedToolCall: expectedToolCallSchema.optional(),
    answerAssertions: answerAssertionsSchema.optional(),
    notes: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const expected = CATEGORY_DIRECTION_PAIRS[value.category];
    if (value.gapHonestyDirection !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["gapHonestyDirection"],
        message: `category "${value.category}" requires gapHonestyDirection "${expected}", got "${value.gapHonestyDirection}"`,
      });
    }
  });

export type EvalCase = z.infer<typeof evalCaseSchema>;

/** The full dataset: an array of valid cases with unique ids. */
export const evalDatasetSchema = z.array(evalCaseSchema).superRefine((cases, ctx) => {
  const seen = new Set<string>();
  for (const [index, evalCase] of cases.entries()) {
    if (seen.has(evalCase.id)) {
      ctx.addIssue({
        code: "custom",
        path: [index, "id"],
        message: `duplicate case id: "${evalCase.id}"`,
      });
    }
    seen.add(evalCase.id);
  }
});
