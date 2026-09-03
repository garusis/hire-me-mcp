/**
 * Zod schema for the golden retrieval dataset (#41, epic #6): a small,
 * curated, version-controlled set of query -> expected-source-ids entries
 * that scores `searchCareer` (#34). See `./cases.ts` for the entries
 * themselves and this module's sibling `./validate-sources.ts` for the "no
 * dangling ids" check against the real career-data corpus.
 *
 * `category` mirrors the four buckets the issue's locked decisions call
 * for:
 * - **`exact`** — a deterministic, single-fact question (a skill's exact
 *   name, a role's exact company). Semantic search should find these
 *   trivially; they exist as a sanity floor.
 * - **`fuzzy`** — a recruiter-phrased question with no literal wording
 *   overlap with the source content. This is where semantic search "earns
 *   its keep" over exact keyword matching.
 * - **`cross-cutting`** — a thematic question whose answer spans multiple
 *   source records (several skills, several experience entries, several
 *   projects).
 * - **`absent-topic`** — a plausible recruiter question about something
 *   genuinely absent from the corpus. `expectEmpty: true` is required
 *   (and `expectedSources` must be empty) for this category, and forbidden
 *   for every other category — enforced here via `superRefine`, not left to
 *   convention, so a malformed entry fails a schema test rather than
 *   silently mis-scoring at eval time.
 */

import { z } from "zod";

/** The four golden dataset categories — see this module's docstring for what each probes. */
export const goldenQueryCategorySchema = z.enum([
  "exact",
  "fuzzy",
  "cross-cutting",
  "absent-topic",
]);
export type GoldenQueryCategory = z.infer<typeof goldenQueryCategorySchema>;

const KEBAB_CASE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A pointer to the source record (never a chunk id — see this module's docstring) a query's answer should resolve to. */
export const expectedSourceSchema = z
  .object({
    sourceType: z.string().min(1),
    sourceId: z.string().min(1),
  })
  .strict();
export type ExpectedGoldenSource = z.infer<typeof expectedSourceSchema>;

/**
 * `"all"` (default): every `expectedSources` entry is required.
 * `"any"`: at least one `expectedSources` entry is an independently
 * complete, acceptable answer (#295's "multiple-valid-answer" semantics).
 */
export const matchModeSchema = z.enum(["all", "any"]);
export type MatchMode = z.infer<typeof matchModeSchema>;

function sameSource(a: ExpectedGoldenSource, b: ExpectedGoldenSource): boolean {
  return a.sourceType === b.sourceType && a.sourceId === b.sourceId;
}

interface RawGoldenQuery {
  category: GoldenQueryCategory;
  expectedSources: ExpectedGoldenSource[];
  expectEmpty?: true;
  matchMode?: MatchMode;
  preferredSource?: ExpectedGoldenSource;
}

/** `expectEmpty`/`expectedSources` <-> `absent-topic` consistency (this module's docstring's "forbidden for every other category"). */
function checkAbsentTopicShape(value: RawGoldenQuery, ctx: z.RefinementCtx): void {
  const isAbsentTopic = value.category === "absent-topic";

  if (isAbsentTopic && value.expectEmpty !== true) {
    ctx.addIssue({
      code: "custom",
      path: ["expectEmpty"],
      message: 'category "absent-topic" requires expectEmpty: true',
    });
  }
  if (!isAbsentTopic && value.expectEmpty !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["expectEmpty"],
      message: `category "${value.category}" must not set expectEmpty`,
    });
  }
  if (isAbsentTopic && value.expectedSources.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["expectedSources"],
      message: 'category "absent-topic" requires an empty expectedSources array',
    });
  }
  if (!isAbsentTopic && value.expectedSources.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["expectedSources"],
      message: `category "${value.category}" requires at least one expected source`,
    });
  }
}

/** `matchMode`/`preferredSource` category constraints (#295): forbidden on `absent-topic`, `"any"` forbidden on `cross-cutting`. */
function checkMatchModeShape(value: RawGoldenQuery, ctx: z.RefinementCtx): void {
  const isAbsentTopic = value.category === "absent-topic";

  if (isAbsentTopic && value.matchMode !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["matchMode"],
      message: 'category "absent-topic" must not set matchMode',
    });
  }
  if (isAbsentTopic && value.preferredSource !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["preferredSource"],
      message: 'category "absent-topic" must not set preferredSource',
    });
  }
  if (value.category === "cross-cutting" && value.matchMode === "any") {
    ctx.addIssue({
      code: "custom",
      path: ["matchMode"],
      message:
        'category "cross-cutting" requires matchMode "all" (evidence must span every listed source)',
    });
  }
}

/** No duplicate `(sourceType, sourceId)` pairs in `expectedSources` (#295: "a duplicate is a schema error, never a silently merged entry"). */
function checkNoDuplicateSources(value: RawGoldenQuery, ctx: z.RefinementCtx): void {
  const seenSources: ExpectedGoldenSource[] = [];
  for (const [index, source] of value.expectedSources.entries()) {
    if (seenSources.some((seen) => sameSource(seen, source))) {
      ctx.addIssue({
        code: "custom",
        path: ["expectedSources", index],
        message: `duplicate expectedSources entry: "${source.sourceType}:${source.sourceId}"`,
      });
    }
    seenSources.push(source);
  }
}

/** `preferredSource`, when declared, must also appear in `expectedSources` (#295). */
function checkPreferredSourceIsExpected(value: RawGoldenQuery, ctx: z.RefinementCtx): void {
  if (
    value.preferredSource !== undefined &&
    !value.expectedSources.some((source) =>
      sameSource(source, value.preferredSource as ExpectedGoldenSource),
    )
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["preferredSource"],
      message: "preferredSource must also appear in expectedSources",
    });
  }
}

/** One golden retrieval query. */
export const goldenQuerySchema = z
  .object({
    id: z.string().regex(KEBAB_CASE_REGEX, "id must be kebab-case"),
    query: z.string().min(1),
    category: goldenQueryCategorySchema,
    expectedSources: z.array(expectedSourceSchema),
    expectEmpty: z.literal(true).optional(),
    matchMode: matchModeSchema.optional(),
    preferredSource: expectedSourceSchema.optional(),
    notes: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    checkAbsentTopicShape(value, ctx);
    checkMatchModeShape(value, ctx);
    checkNoDuplicateSources(value, ctx);
    checkPreferredSourceIsExpected(value, ctx);
  });

export type GoldenQuery = z.infer<typeof goldenQuerySchema>;

/** The full golden dataset: an array of valid entries with unique ids. */
export const goldenDatasetSchema = z.array(goldenQuerySchema).superRefine((entries, ctx) => {
  const seen = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    if (seen.has(entry.id)) {
      ctx.addIssue({
        code: "custom",
        path: [index, "id"],
        message: `duplicate golden query id: "${entry.id}"`,
      });
    }
    seen.add(entry.id);
  }
});
