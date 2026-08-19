import type { ContentValidationError } from "./content/loader.js";
import { validateContentDir } from "./content/loader.js";

export interface ValidateResult {
  ok: boolean;
  errors: ContentValidationError[];
}

/**
 * Loads and validates every content file under `contentDir`. Never throws —
 * `ok` is false and `errors` lists every failure (not just the first) when
 * anything is invalid.
 */
export function runValidate(contentDir: string): ValidateResult {
  const errors = validateContentDir(contentDir);
  return { ok: errors.length === 0, errors };
}

/** Formats a human-readable report: one line per error, file path + field path + message. */
export function formatValidationReport(errors: ContentValidationError[]): string {
  if (errors.length === 0) {
    return "career-data: no errors — all content is valid.";
  }
  const lines = errors.map((error) => `${error.file}: ${error.path}: ${error.message}`);
  return [`career-data: ${errors.length} error(s) found:`, ...lines].join("\n");
}
