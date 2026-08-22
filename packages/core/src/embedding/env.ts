/**
 * `GOOGLE_GENERATIVE_AI_API_KEY` loader for the embedding client (#24) —
 * the same env var `packages/agent`'s chat model provider reads (see
 * `.env.example`), reused here rather than introducing a second key for
 * the same Google account. Never includes the key's value in an error.
 */

export type EmbeddingEnvSource = Readonly<Record<string, string | undefined>>;

/** Thrown when `GOOGLE_GENERATIVE_AI_API_KEY` is missing or blank. Never carries a value. */
export class MissingEmbeddingApiKeyError extends Error {
  constructor() {
    super(
      "GOOGLE_GENERATIVE_AI_API_KEY is not set. Configure it in an untracked .env.local " +
        "(see .env.example) or your shell environment before running ingestion.",
    );
    this.name = "MissingEmbeddingApiKeyError";
  }
}

/** Reads and validates `GOOGLE_GENERATIVE_AI_API_KEY` (defaults to `process.env`). */
export function loadEmbeddingApiKey(env: EmbeddingEnvSource = process.env): string {
  const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new MissingEmbeddingApiKeyError();
  }
  return apiKey;
}
