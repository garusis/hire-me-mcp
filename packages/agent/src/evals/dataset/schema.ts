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
import { CITABLE_ENTITY_TYPES, type CitableEntityType } from "../../citations.js";

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
 * `get-skill-evidence` already answers precisely. `"list-career-stories"`
 * (#294) asserts the trace includes the complete-story tool — a behavioral,
 * "tell me about a time" question naming or clearly implying a known
 * competency. `"search-career-story-scoped"` (#294, tightened after
 * independent review) asserts `search-career` was called WITH `sourceTypes`
 * including `"story"`, and — when a subsequent `list-career-stories` fetch
 * exists — that the story-scoped search precedes it, per #305 decision 5's
 * locked fuzzy-behavioral route; plain `"search-career"` only checks tool
 * presence and cannot detect a call missing that argument. Optional: most
 * existing cases don't assert routing at all. See `../scorers/tool-routing.ts`.
 */
export const expectedToolCallSchema = z.enum([
  "search-career",
  "deterministic-only",
  "list-career-stories",
  "search-career-story-scoped",
]);
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

const citableEntityTypeSchema = z.enum(
  CITABLE_ENTITY_TYPES as [CitableEntityType, ...CitableEntityType[]],
);

/**
 * A pointer at one citation marker — `{ entityType, entityId }`, the same
 * pair `ReturnedCitation` (`../scorers/types.ts`) carries. Used by
 * `mustCiteEntity`/`mustNotCiteEntity` below (#294 independent-review
 * correction, findings 2-4): unlike a `mustMatch` text pattern, this asserts
 * against the `[cite:...]` markers actually present in the answer text
 * (`../scorers/answer-assertions.ts`, checked via the shared
 * `parseCitations`), so an answer that merely mentions the right words
 * without actually citing that entity (or that cites a DIFFERENT entity
 * alongside the right wording) is caught.
 */
const citationRefSchema = z
  .object({
    entityType: citableEntityTypeSchema,
    entityId: z.string().min(1),
  })
  .strict();
export type EvalCaseCitationRef = z.infer<typeof citationRefSchema>;

/**
 * One #295 multiple-valid-answer or cross-cutting citation requirement — the
 * locked manifest's `any`/`all` semantics (`../scorers/answer-assertions.ts`
 * scores these via `scoreAnswerAssertions`'s `citationGroups` handling):
 *
 * - `"all"` (cross-cutting, e.g. C01/C02): every ref in `refs` must be cited.
 * - `"any"` (multiple-valid-answer, e.g. A01-A08, and X01/X02/F02's
 *   preferred-source cases): the answer must cite EXACTLY ONE of `refs` — a
 *   complete single story, not zero (an unanswered honest candidate) and not
 *   several blended together (the manifest's "one-story answer semantics").
 *   `preferredRef`, when set, additionally requires that one cited ref to BE
 *   `preferredRef` specifically — the locked preferred-source invariant
 *   (e.g. #305 decision 8's "story 001 > 002") that a plain `any` set alone
 *   cannot express, since it would accept any single member.
 *
 * `preferredRef` must itself be one of `refs` (enforced below) — expressing
 * a preference for a citation that isn't even an acceptable answer would be
 * a self-contradictory case.
 */
export const citationGroupSchema = z
  .object({
    mode: z.enum(["any", "all"]),
    refs: z.array(citationRefSchema).min(2),
    preferredRef: citationRefSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.preferredRef !== undefined &&
      !value.refs.some(
        (ref) =>
          ref.entityType === value.preferredRef?.entityType &&
          ref.entityId === value.preferredRef?.entityId,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["preferredRef"],
        message: "preferredRef must be one of refs",
      });
    }
  });
export type EvalCaseCitationGroup = z.infer<typeof citationGroupSchema>;

/**
 * One #295 third-independent-review correction (finding 1) conditional
 * positive-caveat requirement: `pattern` (case-insensitive) must appear in
 * the answer TEXT, but only when the answer actually cites `ifCitedRef` —
 * unlike a plain `mustMatch`, which is unconditional. This is how a
 * required caveat tied to ONE specific acceptable story (e.g. story 004's
 * mandatory spam/unsupported-case/observability-gap caveat, #295's
 * "Story-specific factual-boundary assertions" section) is enforced without
 * also forcing it on an `any` case that truthfully answers with a
 * different acceptable story that carries no such caveat (e.g. 015).
 */
const conditionalMustMatchSchema = z
  .object({
    ifCitedRef: citationRefSchema,
    pattern: regexSourceSchema,
  })
  .strict();
export type EvalCaseConditionalMustMatch = z.infer<typeof conditionalMustMatchSchema>;

/**
 * Content assertions on the answer (#300, #295's factual boundaries; #294
 * independent-review correction extends this beyond text). `mustMatch` /
 * `mustNotMatch` are case-insensitive regular-expression sources checked
 * against the answer TEXT (e.g. that the document-extraction work is called
 * a "proof of concept"). `mustCiteEntity` / `mustNotCiteEntity` are checked
 * against the `[cite:...]` markers actually present in that same answer text
 * instead — the required (or forbidden) evidence a behavioral answer must
 * (or must not) actually be grounded in, not just wording. `citationGroups`
 * (#295) is for a case with SEVERAL honest candidate citations rather than
 * one fixed required/forbidden pair — see `citationGroupSchema` above.
 * `conditionalMustMatch` (#295 third-independent-review correction, finding
 * 1) is a `mustMatch` scoped to only apply when a specific story is
 * actually cited — see `conditionalMustMatchSchema` above. Scored by
 * `../scorers/answer-assertions.ts`; a block must assert at least one thing
 * across all six lists.
 */
export const answerAssertionsSchema = z
  .object({
    mustMatch: z.array(regexSourceSchema).optional(),
    mustNotMatch: z.array(regexSourceSchema).optional(),
    mustCiteEntity: z.array(citationRefSchema).optional(),
    mustNotCiteEntity: z.array(citationRefSchema).optional(),
    citationGroups: z.array(citationGroupSchema).optional(),
    conditionalMustMatch: z.array(conditionalMustMatchSchema).optional(),
  })
  .strict()
  .refine(
    (value) =>
      (value.mustMatch?.length ?? 0) +
        (value.mustNotMatch?.length ?? 0) +
        (value.mustCiteEntity?.length ?? 0) +
        (value.mustNotCiteEntity?.length ?? 0) +
        (value.citationGroups?.length ?? 0) +
        (value.conditionalMustMatch?.length ?? 0) >
      0,
    {
      message:
        "answerAssertions must declare at least one mustMatch/mustNotMatch/mustCiteEntity/mustNotCiteEntity/citationGroups/conditionalMustMatch entry",
    },
  );
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
    /**
     * Required competency values (#294 independent-review correction,
     * finding 2) the located `list-career-stories` call's `competencies`
     * argument must contain, checked only when `expectedToolCall` is
     * `"list-career-stories"` — tool-name presence alone cannot prove the
     * known-competency route actually asked for the right competency (e.g.
     * `"leadership"`), not an empty or unrelated one. Optional: most cases
     * asserting `"list-career-stories"` routing don't need this precision.
     */
    expectedCompetencies: z.array(z.string().min(1)).min(1).optional(),
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
