import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatValidationReport, runValidate } from "./validate.js";

/**
 * `pnpm --filter @hire-me-mcp/career-data validate` entry point.
 *
 * Validates every content file under `content/` (or an override directory
 * passed as the first CLI argument, used by the CLI's own integration
 * tests) and exits non-zero with a full error report when anything is
 * invalid.
 */
const contentDir =
  process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "content");

const { ok, errors } = runValidate(contentDir);
console.log(formatValidationReport(errors));
process.exit(ok ? 0 : 1);
