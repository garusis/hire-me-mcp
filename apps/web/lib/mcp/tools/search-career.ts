/**
 * `search-career` (#61) — thin adapter over `packages/core`'s
 * `searchCareer(query, options?)` (`@hire-me-mcp/core/search-career`, #34):
 * the server's one semantic/fuzzy retrieval tool, embedding `query` and
 * running an ANN cosine-similarity search against the Neon pgvector store.
 *
 * "Thin adapter" here means: input validation, calling `searchCareer`
 * through the live instance (`../search-career-instance.ts`), and mapping
 * its plain `SearchCareerResult` into this server's `DomainResult` envelope
 * — no re-ranking, no re-scoring, no rewriting of `text`. The one genuine
 * reshaping this handler does is turning the flat `results` array (which,
 * unlike every other tool's `DomainResult`, carries a *per-item* citation
 * rather than one collection-level citation list) into:
 *
 * - `{ found: true, results }` when there's at least one hit, each with its
 *   `citation`'s human-readable `label` inlined as a plain string (plus
 *   `citationUrl` when the citation has one) right next to the excerpt text
 *   — so a model quoting one `results[i]` naturally carries the citation
 *   along with it, without a second lookup into a separate `citations`
 *   array by index.
 * - `{ found: false, message }` — an explicit, honest "no relevant content
 *   found" outcome instead of `{ found: true, results: [] }`, so a client
 *   never mistakes silence for "there is no evidence" and hallucinates
 *   around an empty array (#61 acceptance criterion).
 *
 * `citations` (the envelope's own top-level array — see `envelope.ts`)
 * still carries every hit's real `ChunkCitation` object, structurally
 * compatible with `packages/career-data`'s `Citation` (same
 * `entityType`/`entityId`/`label`/`fragment` fields, plus an optional
 * `url` `ChunkCitation` adds) — so citation-aware clients that read
 * `structuredContent.citations` directly still get the full, unmodified
 * objects.
 *
 * Upstream failures (a missing `DATABASE_URL`/`GOOGLE_GENERATIVE_AI_API_KEY`
 * — see `../search-career-instance.ts` — or a real embedding/database
 * error) are caught here, logged server-side with full detail via
 * `console.error`, then rethrown as a plain `Error`. `define-tool.ts`'s
 * `mapThrownError` treats any non-`ToolDomainError` throw as `internal_error`
 * with a fixed, generic client-facing message regardless of the original
 * error's content — so nothing about a connection string, API key, stack
 * trace, or internal path ever reaches the client, while the operator still
 * gets the real detail in server logs (#61's graceful-degradation and
 * upstream-failure acceptance criteria).
 */

import {
  MAX_QUERY_LENGTH,
  MAX_TOP_K,
  MIN_TOP_K,
  RELEVANCE_FLOOR,
} from "@hire-me-mcp/core/search-career";
import { z } from "zod";
import { resolveCitationSiteUrl } from "../citation-site-urls";
import type { ToolDefinition } from "../define-tool";
import { getSearchCareer } from "../search-career-instance";

/** One ranked hit, reshaped so its citation travels inline with the excerpt (see module docstring). */
export interface SearchCareerHit {
  text: string;
  /** Cosine similarity — higher is more similar. See `@hire-me-mcp/core/search-career`'s score-semantics doc. */
  score: number;
  sourceType: string;
  sourceId: string;
  /** Human-readable citation label — quote this alongside `text` when relaying the excerpt. */
  citation: string;
  /** The chunk's own external canonical URL when it has one, otherwise the source record's page on this site (#247). */
  citationUrl: string;
}

/** `search-career`'s result: either ranked hits, or an explicit "nothing above threshold" outcome. */
export type SearchCareerToolData =
  | { found: true; results: SearchCareerHit[] }
  | { found: false; message: string };

/**
 * The chunked source types a caller may filter by — exactly the entity
 * types the ingestion pipeline chunks (`@hire-me-mcp/core`'s
 * `chunkCareerData`, #21). Declared as a Zod enum so an unknown value is an
 * `invalid_input` validation error naming the valid set (#238), never a
 * silent empty "no relevant content found" result that sends the caller off
 * rephrasing a query that was fine.
 */
const SEARCH_SOURCE_TYPES = [
  "profile",
  "experience",
  "project",
  "skill",
  "gap",
  "education",
  "writing",
] as const;

const inputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(MAX_QUERY_LENGTH)
    .describe(
      `Free-text question or phrase to search Marcos Alvarez's career content for, ` +
        `semantically — e.g. 'event-driven architecture experience' or 'has he led a team'. ` +
        `1-${MAX_QUERY_LENGTH} characters after trimming; empty or whitespace-only is invalid.`,
    ),
  topK: z
    .number()
    .int()
    .min(MIN_TOP_K)
    .max(MAX_TOP_K)
    .optional()
    .describe(
      `Maximum number of ranked excerpts to return, an integer in [${MIN_TOP_K}, ${MAX_TOP_K}]. ` +
        "Omit for the server's default (currently 10).",
    ),
  minScore: z
    .number()
    .min(-1)
    .max(1)
    .optional()
    .describe(
      "Minimum cosine-similarity score (in [-1, 1], higher is more similar) a result must " +
        `meet. The server always applies its calibrated relevance floor of ${RELEVANCE_FLOOR} ` +
        "— scores below it are indistinguishable from off-topic noise — so values below the " +
        "floor have no effect. Set this above the floor for a stricter cut; omit for the " +
        "floor itself.",
    ),
  sourceTypes: z
    .array(
      z.enum(SEARCH_SOURCE_TYPES, {
        error: () => `expected one of ${SEARCH_SOURCE_TYPES.map((t) => `'${t}'`).join(", ")}`,
      }),
    )
    .optional()
    .describe(
      "Restricts results to these source types. Valid values: " +
        `${SEARCH_SOURCE_TYPES.map((t) => `'${t}'`).join(", ")}. Omit for no constraint.`,
    ),
});

function noRelevantContentMessage(query: string): string {
  return (
    `No relevant content found for "${query}". Try rephrasing, or use get-experience / ` +
    "search-projects / get-skill-evidence for a more targeted, deterministic lookup."
  );
}

/** `search-career` — registered against a live `McpServer` via `defineTool`. */
export const searchCareerTool: ToolDefinition<typeof inputSchema, SearchCareerToolData> = {
  name: "search-career",
  description:
    "Runs a fuzzy, semantic search over the full text of Marcos Alvarez's career content " +
    "(experience, projects, skills, writing) and returns ranked excerpts, each with a " +
    "relevance score and a citation, or an explicit 'no relevant content found' result when " +
    "nothing clears the server's calibrated relevance floor — off-topic questions get that " +
    "honest empty result, not low-scoring noise. Use this for open-ended, cross-cutting, or " +
    "conceptual questions a structured lookup can't answer directly — e.g. 'has he worked " +
    "with event-driven architectures', 'what's his experience with leading teams', 'anything " +
    "about cost optimization'. Do not use it when the question maps onto a specific, " +
    "structured lookup the deterministic tools already answer exactly: get-profile for who " +
    "he is, get-experience for a role/company/date-range work history, search-projects for " +
    "keyword/tag project search, and get-skill-evidence to check one specific named skill or " +
    "technology — prefer those first, and fall back to this tool only when they don't fit. " +
    "This tool is more expensive per call (it embeds the query) and subject to the same " +
    "server-wide rate limit as every other tool here — don't call it repeatedly for the same " +
    "question.",
  inputSchema,
  handler: async (input) => {
    let result: Awaited<ReturnType<ReturnType<typeof getSearchCareer>>>;
    try {
      const searchCareer = getSearchCareer();
      result = await searchCareer(input.query, {
        topK: input.topK,
        // The calibrated relevance floor (#237) is a hard baseline: an
        // explicit minScore below it would reopen the door to
        // confident-looking off-topic noise, so the effective threshold is
        // never lower than the floor — only stricter.
        minScore: Math.max(RELEVANCE_FLOOR, input.minScore ?? RELEVANCE_FLOOR),
        sourceTypes: input.sourceTypes,
      });
    } catch (error) {
      console.error("search-career tool: upstream failure", error);
      throw error instanceof Error ? error : new Error(String(error));
    }

    if (result.results.length === 0) {
      return {
        data: { found: false, message: noRelevantContentMessage(input.query) },
        citations: [],
      };
    }

    const hits: SearchCareerHit[] = result.results.map((item) => ({
      text: item.text,
      score: item.score,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      citation: item.citation.label,
      // The chunk's own external canonical url when it has one, otherwise
      // the source record's page on this site (#247) — every hit is
      // linkable back to its source.
      citationUrl: resolveCitationSiteUrl(item.citation),
    }));

    return {
      data: { found: true, results: hits },
      citations: result.results.map((item) => item.citation),
    };
  },
};
