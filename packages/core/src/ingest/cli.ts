import { chunkCareerData } from "../chunking/index.js";
import { createDbClient } from "../db/client.js";
import { loadDbConfig, MissingDatabaseUrlError } from "../db/config.js";
import { STORED_EMBEDDING_MODEL_ID } from "../embedding/config.js";
import { loadEmbeddingApiKey, MissingEmbeddingApiKeyError } from "../embedding/env.js";
import { createGoogleEmbeddingClient } from "../embedding/google-client.js";
import { createPacedEmbedder, InvalidPacingOptionsError } from "../embedding/pacing.js";
import { InvalidEmbedPacingError, loadEmbedMaxTextsPerMinute } from "../embedding/pacing-env.js";
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
  const maxTextsPerMinute = loadEmbedMaxTextsPerMinute();

  const client = createDbClient(dbConfig);
  try {
    const pacedEmbedder = createPacedEmbedder(
      createGoogleEmbeddingClient({ apiKey, taskType: "RETRIEVAL_DOCUMENT" }),
      { maxTextsPerMinute },
    );
    const summary = await runIngest({
      repository: createContentCareerDataRepository(),
      chunker: chunkCareerData,
      embedder: pacedEmbedder,
      store: createDbIngestStore(client.sql),
      modelId: STORED_EMBEDDING_MODEL_ID,
      dryRun: args.dryRun,
      full: args.full,
      // `runIngest` embeds+persists one `persistBatchSize`-sized batch at a
      // time (#317) — the paced embedder's own `onBatch` would report
      // every call as e.g. "16/16" (it only sees one call's texts), so
      // progress logging is wired here instead, off the cumulative
      // persisted count across the whole run.
      onProgress: ({ persisted, total }) => {
        // stderr (not stdout) so `formatIngestSummary`'s output stays the
        // only thing on stdout — see cli.ts's docstring.
        console.error(`persisted ${persisted}/${total} chunks`);
      },
    });
    console.log(formatIngestSummary(summary));
  } finally {
    await client.close();
  }
} catch (error) {
  if (
    error instanceof MissingDatabaseUrlError ||
    error instanceof MissingEmbeddingApiKeyError ||
    error instanceof InvalidIngestArgError ||
    error instanceof InvalidEmbedPacingError ||
    error instanceof InvalidPacingOptionsError
  ) {
    console.error(error.message);
  } else {
    console.error("Ingestion failed:", error);
  }
  process.exit(1);
}
