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
import { getCareerDataRepository } from "../../../src/lib/content/repository";
import type { ToolDefinition } from "../define-tool";

/**
 * Derived from `searchProjects`'s own return type rather than importing
 * `Project` from `@hire-me-mcp/career-data` directly — apps/web reads
 * career content only through `src/lib/content/` (issue #16, enforced by
 * biome).
 */
type ProjectSearchResult = ReturnType<typeof searchProjects>["data"][number];

const inputSchema = z.object({
  query: z
    .string()
    .describe(
      "Free-text keyword query matched against project names, summaries, bodies and tech " +
        "tags. An empty or whitespace-only query returns no results, not an error.",
    ),
  tags: z
    .array(z.string().min(1))
    .optional()
    .describe(
      "Restricts candidates to projects with at least one of these technology tags (OR " +
        "semantics) before ranking. Omit for no constraint.",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum number of ranked results to return. Omit to return every match."),
});

/** `search-projects` — registered against a live `McpServer` via `defineTool`. */
export const searchProjectsTool: ToolDefinition<typeof inputSchema, ProjectSearchResult[]> = {
  name: "search-projects",
  description:
    "Searches Marcos Alvarez's project portfolio by keyword and/or technology tag and " +
    "returns ranked matches, each with a relevance score, a matched-field explanation, and a " +
    "citation. Matching is deterministic keyword/tag search against project names, summaries, " +
    "bodies and tech tags — there is no semantic or embedding-based understanding of the " +
    "query today. Use this when asked to find or describe specific projects, e.g. 'show me " +
    "projects that used React' or 'what did they build with Kubernetes'. Do not use it for a " +
    "chronological work history (use get-experience) or to check whether a skill is claimed " +
    "at all, evidence or gap (use get-skill-evidence). A query matching no projects returns a " +
    "successful result with an empty list, not an error; an empty or whitespace-only query " +
    "behaves the same way.",
  inputSchema,
  handler: (input) =>
    searchProjects(getCareerDataRepository(), input.query, {
      tags: input.tags,
      limit: input.limit,
    }),
};
