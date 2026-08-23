/**
 * Lazily-constructed, module-scope-memoized `searchCareer` for the interview
 * agent's `search-career` tool (#75, epic #6). Mirrors `./repository.ts`'s
 * memoization pattern (build once, reuse across every call in this
 * process/warm serverless invocation) — the same "serverless-safe" posture
 * `packages/core/src/db/client.ts` documents for `createDbClient` (a
 * lazily-connecting pool, safe to construct once at module scope and reuse
 * across a warm Lambda/Vercel function invocation rather than opening a new
 * pool per request).
 *
 * Both `DATABASE_URL` (`@hire-me-mcp/core/db`) and
 * `GOOGLE_GENERATIVE_AI_API_KEY` (`@hire-me-mcp/core/embedding`) are
 * required for real semantic search; either being unset/blank is a normal,
 * expected deployment state (e.g. a preview environment without the
 * database wired up yet), not a crash — `resolveAgentSearchCareer` NEVER
 * throws for that case, returning a typed `{ available: false, reason }`
 * instead so the `search-career` tool (`./search-career.ts`) can relay an
 * honest "search unavailable" result to the model rather than the agent
 * erroring out mid-conversation.
 */

import { createDbClient, loadDbConfig, MissingDatabaseUrlError } from "@hire-me-mcp/core/db";
import {
  createGoogleEmbeddingClient,
  loadEmbeddingApiKey,
  MissingEmbeddingApiKeyError,
} from "@hire-me-mcp/core/embedding";
import { createSearchCareer, type SearchCareer } from "@hire-me-mcp/core/search-career";

/** Minimal env shape this module reads — satisfied by `process.env`. */
export type SearchCareerEnvSource = Readonly<Record<string, string | undefined>>;

/** Whether real semantic search is configured for this process, and the function/reason either way. */
export type SearchCareerAvailability =
  | { available: true; searchCareer: SearchCareer }
  | { available: false; reason: string };

/**
 * Builds a {@link SearchCareerAvailability} from `env` — real, working
 * `searchCareer` when both `DATABASE_URL` and `GOOGLE_GENERATIVE_AI_API_KEY`
 * are configured; a named, typed "unavailable" result otherwise. Never
 * throws: `MissingDatabaseUrlError`/`MissingEmbeddingApiKeyError` (the only
 * errors `loadDbConfig`/`loadEmbeddingApiKey` raise) are caught here and
 * turned into the `reason` string. Any other, genuinely unexpected
 * construction error still propagates — this function only absorbs the two
 * documented "not configured yet" cases, not arbitrary failures.
 *
 * Construction itself performs no network I/O (`createDbClient` connects
 * lazily; the AI SDK's Google provider factory just builds a client
 * descriptor — see `model-provider.ts`'s equivalent doc comment), so calling
 * this eagerly at module load is safe even without real credentials.
 */
export function resolveAgentSearchCareer(
  env: SearchCareerEnvSource = process.env,
): SearchCareerAvailability {
  try {
    const dbConfig = loadDbConfig(env as NodeJS.ProcessEnv);
    const apiKey = loadEmbeddingApiKey(env);
    const { sql } = createDbClient(dbConfig);
    const embedder = createGoogleEmbeddingClient({ apiKey, taskType: "RETRIEVAL_QUERY" });
    return { available: true, searchCareer: createSearchCareer({ sql, embedder }) };
  } catch (error) {
    if (error instanceof MissingDatabaseUrlError || error instanceof MissingEmbeddingApiKeyError) {
      return { available: false, reason: error.message };
    }
    throw error;
  }
}

let cachedAvailability: SearchCareerAvailability | undefined;

/**
 * The shared, memoized {@link SearchCareerAvailability} for the real
 * process environment — resolved once per process (warm serverless
 * invocation), mirroring `./repository.ts`'s `getAgentCareerDataRepository`.
 */
export function getAgentSearchCareer(): SearchCareerAvailability {
  cachedAvailability ??= resolveAgentSearchCareer(process.env);
  return cachedAvailability;
}

/** Test-only: reset the module-scope memoized availability so a test can re-resolve against a different env. */
export function resetAgentSearchCareerForTests(): void {
  cachedAvailability = undefined;
}
