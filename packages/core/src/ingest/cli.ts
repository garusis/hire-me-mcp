import { chunkCareerData } from "../chunking/index.js";
import { createDbClient } from "../db/client.js";
import { loadDbConfig, MissingDatabaseUrlError } from "../db/config.js";
import { STORED_EMBEDDING_MODEL_ID } from "../embedding/config.js";
import { loadEmbeddingApiKey, MissingEmbeddingApiKeyError } from "../embedding/env.js";
import { createGoogleEmbeddingClient } from "../embedding/google-client.js";
import { createContentCareerDataRepository } from "../repository.js";
import { InvalidIngestArgError, parseIngestArgs } from "./args.js";
import { runIngest } from "./run.js";
import { createDbIngestStore } from "./store.js";
import { formatIngestSummary } from "./summary.js";

/**
 * `pnpm ingest` entry point (#24) — see `db/migrate-cli.ts` for the sibling
 * pattern this follows: read env, do the work, print a summary, exit
 * non-zero on any failure with a clear, no-secrets message. Non-interactive
 * by design (no prompts) so it's safe to run on every CI/deploy (wiring
 * that up is #41, out of scope here).
 */
try {
  const args = parseIngestArgs(process.argv.slice(2));
  const dbConfig = loadDbConfig();
  const apiKey = loadEmbeddingApiKey();

  const client = createDbClient(dbConfig);
  try {
    const summary = await runIngest({
      repository: createContentCareerDataRepository(),
      chunker: chunkCareerData,
      embedder: createGoogleEmbeddingClient({ apiKey, taskType: "RETRIEVAL_DOCUMENT" }),
      store: createDbIngestStore(client.sql),
      modelId: STORED_EMBEDDING_MODEL_ID,
      dryRun: args.dryRun,
      full: args.full,
    });
    console.log(formatIngestSummary(summary));
  } finally {
    await client.close();
  }
} catch (error) {
  if (
    error instanceof MissingDatabaseUrlError ||
    error instanceof MissingEmbeddingApiKeyError ||
    error instanceof InvalidIngestArgError
  ) {
    console.error(error.message);
  } else {
    console.error("Ingestion failed:", error);
  }
  process.exit(1);
}
