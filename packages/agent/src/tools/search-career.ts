/**
 * `search-career` — thin Mastra adapter over `packages/core`'s
 * `createSearchCareer` (`@hire-me-mcp/core/search-career`, #34). Unlike this
 * package's other four tools, it does not read through
 * `CareerDataRepository` — it queries the Neon + pgvector semantic index via
 * `./search-career-client.ts`'s lazily-constructed, memoized
 * `getAgentSearchCareer()` — so it is intentionally NOT wired into
 * `AGENT_TOOL_CORE_FUNCTIONS`'s `CareerDataRepository`-shaped drift check;
 * see `./index.ts`'s own doc comment for how it's still asserted registered.
 *
 * ## Hybrid policy (#75, epic #6 locked decision)
 *
 * Deterministic tools (`get-experience`, `search-projects`,
 * `get-skill-evidence`) stay the primary path for exact, structured
 * questions — this tool exists for fuzzy/cross-cutting questions those
 * can't answer (see the tool `description` below, which the system prompt's
 * `retrievalPolicy` section — `../prompt/sections.ts` — restates as an
 * explicit routing instruction).
 *
 * ## Graceful degradation, never a crash
 *
 * Real semantic search needs `DATABASE_URL` and
 * `GOOGLE_GENERATIVE_AI_API_KEY` at runtime (both configured in Vercel,
 * per #75's scope) — either being unset is a normal deployment state, not
 * an error. `execute` never throws: an unconfigured environment
 * (`getAgentSearchCareer()` reporting `available: false`) and a failed real
 * call (network error, `StoredEmbeddingModelMismatchError`, ...) both
 * collapse to the same typed `{ available: false, reason }` shape the model
 * can honestly relay ("semantic search is unavailable right now") instead
 * of fabricating an answer or breaking the conversation.
 *
 * ## Citation parity with the deterministic tools
 *
 * The result also carries a top-level `citations: Citation[]` array — the
 * same `{ entityType, entityId, fragment?, label }` shape every
 * `packages/core` `DomainResult` returns — so
 * `../evals/cli.ts`'s `extractCitationsFromToolResults` (which reads
 * `payload.result.citations` off every tool call) picks this tool's
 * citations up automatically, with no eval-runner change needed, and the
 * chat UI's citation renderer resolves a `[cite:...]` marker backed by a
 * retrieved chunk exactly the same way it resolves one backed by a
 * deterministic tool.
 *
 * ## Retrieval budget (#75 acceptance criterion)
 *
 * `applyRetrievalBudget` bounds what's injected into the model's context:
 * at most {@link MAX_RESULTS} chunks, and at most {@link MAX_TOTAL_CHARACTERS}
 * combined characters of chunk text — applied on top of (never instead of)
 * `searchCareer`'s own `topK`, so a caller requesting a large `topK` against
 * a store that genuinely has that many strong matches still can't crowd out
 * the rest of the conversation. Results are already score-sorted descending
 * by `searchCareer`, so truncation always drops the WEAKEST matches first.
 */

import type { Citation } from "@hire-me-mcp/core";
import type { SearchCareerResultItem } from "@hire-me-mcp/core/search-career";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getAgentSearchCareer } from "./search-career-client.js";

/** Max retrieved chunks ever returned to the model in one call — the count half of the retrieval budget. */
export const MAX_RESULTS = 5;
/** Max combined characters of chunk `text` ever returned to the model in one call — the character half of the retrieval budget. */
export const MAX_TOTAL_CHARACTERS = 4000;

/** Bounded: model-driven input from untrusted visitor text, and kept well below `searchCareer`'s own `MAX_TOP_K` (50) since this tool's own budget truncates past a handful of chunks anyway. */
export const searchCareerInputSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .max(500)
      .describe(
        "Free-text question or phrase to search Marcos Alvarez's full career corpus for by " +
          "meaning, not literal keyword overlap — e.g. 'event-driven architecture experience' " +
          "or 'how does he approach mentoring'. An empty query is rejected; ask a real question.",
      ),
    topK: z
      .number()
      .int()
      .positive()
      .max(10)
      .optional()
      .describe(
        "Max number of ranked chunks to request (at most 10; the tool's own retrieval budget " +
          "may return fewer). Omit to use the default.",
      ),
  })
  .strict();

/** One retrieved chunk, mapped for the model — same shape `searchCareer` itself returns, plus nothing added. */
export interface SearchCareerToolResultItem {
  text: string;
  score: number;
  sourceType: string;
  sourceId: string;
  chunkIndex: number;
  citation: SearchCareerResultItem["citation"];
}

/** `search-career`'s tool result — plain JSON, safe to stream straight to the model and the chat UI. */
export interface SearchCareerToolResult {
  query: string;
  /** `false` when semantic search isn't configured or the real call failed — see module docs. */
  available: boolean;
  /** Present only when `available` is `false` — never includes a secret value, only a description. */
  reason?: string;
  results: SearchCareerToolResultItem[];
  /** Flattened `{ entityType, entityId, fragment?, label }` per result — DomainResult-shaped for citation-extraction parity. See module docs. */
  citations: Citation[];
  /** `true` when the retrieval budget (`MAX_RESULTS`/`MAX_TOTAL_CHARACTERS`) dropped or trimmed a result that `searchCareer` itself returned. */
  truncated: boolean;
}

/**
 * Applies this tool's retrieval budget to an already score-sorted-descending
 * `SearchCareerResultItem[]`: at most {@link MAX_RESULTS} items, and at most
 * {@link MAX_TOTAL_CHARACTERS} combined `text` characters across them — an
 * item that would exceed the remaining character budget is trimmed (not
 * silently dropped whole) if it's the first item taken, so a single huge
 * chunk still contributes a usable, budget-sized excerpt.
 */
export function applyRetrievalBudget(results: readonly SearchCareerResultItem[]): {
  results: SearchCareerResultItem[];
  truncated: boolean;
} {
  const countLimited = results.slice(0, MAX_RESULTS);
  let truncated = countLimited.length < results.length;
  const budgeted: SearchCareerResultItem[] = [];
  let usedCharacters = 0;

  for (const item of countLimited) {
    const remaining = MAX_TOTAL_CHARACTERS - usedCharacters;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    if (item.text.length > remaining) {
      budgeted.push({ ...item, text: item.text.slice(0, remaining) });
      usedCharacters += remaining;
      truncated = true;
      break;
    }
    budgeted.push(item);
    usedCharacters += item.text.length;
  }

  return { results: budgeted, truncated };
}

function toCitation(item: SearchCareerResultItem): Citation {
  const { entityType, entityId, fragment, label } = item.citation;
  return fragment ? { entityType, entityId, fragment, label } : { entityType, entityId, label };
}

function unavailableResult(query: string, reason: string): SearchCareerToolResult {
  return { query, available: false, reason, results: [], citations: [], truncated: false };
}

/** `search-career` — registered on the interview agent's tool set. */
export const searchCareerTool = createTool({
  id: "search-career",
  description:
    "Semantically searches Marcos Alvarez's full career corpus (experience, projects, skills, " +
    "gaps, education, writing) by meaning, not literal keyword overlap, returning ranked text " +
    "excerpts with similarity scores and citations. Use this for fuzzy or cross-cutting " +
    "questions that no single deterministic tool answers directly — a theme phrased without " +
    "the corpus's exact wording ('event-driven architecture experience?', 'how does he " +
    "approach mentoring?'), or a question whose answer legitimately spans several records. " +
    "Prefer the deterministic tools (get-experience, search-projects, get-skill-evidence) for " +
    "exact, structured questions — a specific company/date/title, a keyword search over " +
    "projects, or whether one named skill is claimed — those return precise, guaranteed-correct " +
    "data and should be tried first when the question fits their shape; use this tool when they " +
    "don't. A low top score is evidence of absence, not a weak match to lean on — if nothing " +
    "returned here is genuinely relevant, say so honestly rather than stretching a marginal " +
    "result into a claim. Cite every excerpt you rely on using its own citation, exactly as " +
    "returned. When semantic search isn't available (`available: false`), relay that honestly " +
    "instead of guessing.",
  inputSchema: searchCareerInputSchema,
  execute: async (input): Promise<SearchCareerToolResult> => {
    const availability = getAgentSearchCareer();
    if (!availability.available) {
      return unavailableResult(input.query, availability.reason);
    }

    try {
      const result = await availability.searchCareer(input.query, { topK: input.topK });
      const { results, truncated } = applyRetrievalBudget(result.results);
      return {
        query: result.query,
        available: true,
        results: results.map((item) => ({
          text: item.text,
          score: item.score,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          chunkIndex: item.chunkIndex,
          citation: item.citation,
        })),
        citations: results.map(toCitation),
        truncated,
      };
    } catch (error) {
      return unavailableResult(
        input.query,
        error instanceof Error ? error.message : "searchCareer failed with a non-Error throw.",
      );
    }
  },
});
