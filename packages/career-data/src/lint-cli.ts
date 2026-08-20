import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatLintReport, runLint } from "./lint.js";

/**
 * `pnpm --filter @hire-me-mcp/career-data lint:content` entry point.
 *
 * Runs the full content lint (#51) — schema validation (#47) plus every
 * named cross-entity rule — against `content/` (or an override directory
 * passed as the first CLI argument, used by the CLI's own integration
 * tests) and exits non-zero with a full grouped report when any
 * error-severity violation exists.
 */
const contentDir =
  process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "content");

const result = runLint(contentDir);
console.log(formatLintReport(result));
process.exit(result.ok ? 0 : 1);
