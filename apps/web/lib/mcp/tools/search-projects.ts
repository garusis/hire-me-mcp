/**
 * `search-projects` — thin adapter over `packages/core`'s
 * `searchProjects(query, options?)`. v0.3 matching is deterministic
 * keyword/tag search — no embeddings, no semantic ranking (that lands in
 * epic #6) — and this handler adds none of its own: no re-ranking, no
 * truncation beyond what `options.limit` already does inside the domain
 * service (#32).
 */

import { searchProjects } from "@hire-me-mcp/core";
import { z } from "zod";
import { projectSchema } from "../../../src/lib/content/entity-schemas";
import { getCareerDataRepository } from "../../../src/lib/content/repository";
import { nonEmptyStringMessage, numberRangeMessage, type ToolDefinition } from "../define-tool";
import { toolSuccessSchema } from "../wire-schemas";

/**
 * Derived from `searchProjects`'s own return type rather than importing
 * `Project` from `@hire-me-mcp/career-data` directly — apps/web reads
 * career content only through `src/lib/content/` (issue #16, enforced by
 * biome).
 */
type ProjectSearchResult = ReturnType<typeof searchProjects>["data"][number];

/** Upper bound for `limit` — mirrors search-career's topK ceiling; bounds one call's payload (#243). */
const MAX_LIMIT = 50;

const inputSchema = z.object({
  // Optional since #275: the description has always promised search "by
  // keyword AND/OR technology tag", but `query` being required made a
  // tag-only search a validation error rather than the search it advertised.
  // `packages/core`'s `searchProjects` ranks by the tags themselves when no
  // query is given, so the promise is now literally true.
  query: z
    .string()
    .optional()
    .describe(
      "Free-text keyword query matched against project names, summaries, bodies and tech " +
        "tags. Optional: omit it (or pass an empty string) and give `tags` instead for a " +
        "tag-only search. Omitting both returns no results, not an error.",
    ),
  tags: z
    .array(z.string().min(1, { error: () => nonEmptyStringMessage() }))
    .optional()
    .describe(
      "Restricts candidates to projects with at least one of these technology tags (OR " +
        "semantics) before ranking. Valid on its own, with no `query`, in which case the " +
        "tags themselves are what results are ranked by. Omit for no constraint.",
    ),
  limit: z
    .number({ error: () => numberRangeMessage(1, MAX_LIMIT, { integer: true }) })
    .int({ error: () => numberRangeMessage(1, MAX_LIMIT, { integer: true }) })
    .positive({ error: () => numberRangeMessage(1, MAX_LIMIT, { integer: true }) })
    .max(MAX_LIMIT, { error: () => numberRangeMessage(1, MAX_LIMIT, { integer: true }) })
    .optional()
    .describe(
      `Maximum number of ranked results to return, an integer in [1, ${MAX_LIMIT}]. Omit to ` +
        "return every match.",
    ),
});

/** `{ data, citations }` envelope around the ranked project matches (#242). */
const outputSchema = toolSuccessSchema(
  z
    .array(
      z.object({
        project: projectSchema.describe("The full matching project record."),
        score: z
          .number()
          .describe("Deterministic keyword/tag relevance score - higher ranks first."),
        matches: z
          .array(
            z.object({
              field: z.string().describe("Which project field matched (tag, name, summary, body)."),
              token: z.string().describe("The query token that matched."),
            }),
          )
          .describe("Why this project matched."),
      }),
    )
    .describe("Ranked project matches, best first; empty when nothing matches."),
);

/** `search-projects` — registered against a live `McpServer` via `defineTool`. */
export const searchProjectsTool: ToolDefinition<typeof inputSchema, ProjectSearchResult[]> = {
  name: "search-projects",
  title: "Search projects",
  description:
    "Searches Marcos Alvarez's project portfolio by keyword and/or technology tag and " +
    "returns ranked matches, each with a relevance score, a matched-field explanation, and a " +
    "citation. Both inputs are optional and either works alone: pass 'query' for a keyword " +
    "search, 'tags' for a tag-only search (every project carrying one of the tags, ranked by " +
    "them), or both to narrow a keyword search to tagged candidates. Matching is " +
    "deterministic keyword/tag search against project names, summaries, bodies and tech " +
    "tags — there is no semantic or embedding-based understanding of the " +
    "query today. Use this when asked to find or describe specific projects, e.g. 'show me " +
    "projects that used React' or 'what did they build with Kubernetes'. Do not use it for a " +
    "chronological work history (use get-experience) or to check whether a skill is claimed " +
    "at all, evidence or gap (use get-skill-evidence). A search matching no projects returns " +
    "a successful result with an empty list, not an error; so does a call giving neither a " +
    "query nor any tags.",
  inputSchema,
  outputSchema,
  handler: (input) =>
    searchProjects(getCareerDataRepository(), input.query, {
      tags: input.tags,
      limit: input.limit,
    }),
};
