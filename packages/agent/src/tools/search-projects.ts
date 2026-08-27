/**
 * `search-projects` — thin Mastra adapter over `packages/core`'s
 * `searchProjects(query, options?)`. Same domain service the MCP server's
 * `search-projects` tool wraps (`apps/web/lib/mcp/tools/search-projects.ts`).
 * Deterministic keyword/tag search — no embeddings, no semantic ranking
 * (that lands in epic #6) — and this adapter adds none of its own: no
 * re-ranking, no truncation beyond `limit`, which the domain service already
 * applies (#64, mirroring #32).
 */

import { searchProjects } from "@hire-me-mcp/core";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { withCitationMarkers } from "./citation-markers.js";
import { getAgentCareerDataRepository } from "./repository.js";

/**
 * Bounded lengths/counts: model-driven input from untrusted visitor text, so
 * every field carries an explicit ceiling — `limit` in particular is capped
 * well below "unbounded" to prevent a single call from requesting the whole
 * portfolio.
 */
export const searchProjectsInputSchema = z
  .object({
    // Optional since #275, mirroring the MCP surface: "keyword and/or tag"
    // is only true if either argument stands on its own.
    query: z
      .string()
      .max(500)
      .optional()
      .describe(
        "Free-text keyword query matched against project names, summaries, bodies and tech " +
          "tags. Optional: omit it (or pass an empty string) and give `tags` instead for a " +
          "tag-only search. Omitting both returns no results, not an error.",
      ),
    tags: z
      .array(z.string().min(1).max(100))
      .max(20)
      .optional()
      .describe(
        "Restricts candidates to projects with at least one of these technology tags (OR " +
          "semantics) before ranking. Valid on its own, with no `query`, in which case the " +
          "tags themselves are what results are ranked by. Omit for no constraint.",
      ),
    limit: z
      .number()
      .int()
      .positive()
      .max(50)
      .optional()
      .describe(
        "Maximum number of ranked results to return (at most 50). Omit to return every match.",
      ),
  })
  .strict();

/** `search-projects` — registered on the interview agent's tool set. */
export const searchProjectsTool = createTool({
  id: "search-projects",
  description:
    "Searches Marcos Alvarez's project portfolio by keyword and/or technology tag and " +
    "returns ranked matches, each with a relevance score, a matched-field explanation, and a " +
    "citation. Both inputs are optional and either works alone: pass 'query' for a keyword " +
    "search, 'tags' for a tag-only search (every project carrying one of the tags, ranked by " +
    "them), or both to narrow a keyword search to tagged candidates. Matching is " +
    "deterministic keyword/tag search against project names, summaries, " +
    "bodies and tech tags — there is no semantic or embedding-based understanding of the " +
    "query today. Use this when asked to find or describe specific projects, e.g. 'show me " +
    "projects that used React' or 'what did they build with Kubernetes'. Do not use it for a " +
    "chronological work history (use get-experience) or to check whether a skill is claimed " +
    "at all, evidence or gap (use get-skill-evidence). A search matching no projects returns " +
    "a successful result with an empty list, not an error; so does a call giving neither a " +
    "query nor any tags.",
  inputSchema: searchProjectsInputSchema,
  execute: async (input) =>
    withCitationMarkers(
      searchProjects(getAgentCareerDataRepository(), input.query, {
        tags: input.tags,
        limit: input.limit,
      }),
    ),
});
