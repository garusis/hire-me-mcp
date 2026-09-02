import type { ContentValidationError } from "./content/loader.js";
import {
  loadContentDirWithSources,
  loadStoryPreservationMap,
  validateContentDir,
} from "./content/loader.js";
import type { LintViolation } from "./lint/rules.js";
import { ALL_RULES, runRules } from "./lint/rules.js";

export type { LintContext, LintRule, LintSeverity, LintViolation } from "./lint/rules.js";
export { ALL_RULES } from "./lint/rules.js";

export interface LintResult {
  /** `false` if content isn't schema-valid, or if any rule violation is `"error"`-severity. `"warning"`-severity violations never flip this to `false`. */
  ok: boolean;
  /** Cross-entity rule violations — empty when `schemaErrors` is non-empty, since a schema-invalid content set can't be safely loaded into a dataset to check. */
  violations: LintViolation[];
  /** Zod (#47) shape errors. The content lint (#51) is a cross-entity layer on top of schema validation, not a replacement for it — `lint:content` surfaces both so a single command name catches everything that can ship broken. */
  schemaErrors: ContentValidationError[];
}

/**
 * Runs the full content lint against `contentDir`: schema validation first
 * (a schema-invalid file can't be safely loaded into a dataset), then every
 * named rule in {@link ALL_RULES} against the loaded dataset. Never throws —
 * every failure (schema or rule) is collected and returned, not just the
 * first.
 */
export function runLint(contentDir: string): LintResult {
  const schemaErrors = validateContentDir(contentDir);
  if (schemaErrors.length > 0) {
    return { ok: false, violations: [], schemaErrors };
  }

  // allowEmpty: true — the lint tool's entire purpose is checking content
  // that may not be fully authored yet (early scaffolding, a category with
  // nothing written), so "nothing loaded" is a legitimate, tolerated state
  // here, not the #113 misconfiguration signal loadContentDirWithSources
  // guards against by default elsewhere.
  const { dataset, sources } = loadContentDirWithSources(contentDir, { allowEmpty: true });
  const storyPreservationMap = loadStoryPreservationMap(contentDir);
  const violations = runRules({ dataset, sources, storyPreservationMap });
  const ok = !violations.some((violation) => violation.severity === "error");
  return { ok, violations, schemaErrors: [] };
}

/** Formats a `{@link LintViolation}[]`, grouped by rule name, into a human-readable report. */
function formatViolations(violations: LintViolation[]): string {
  if (violations.length === 0) {
    return "no rule violations.";
  }
  const byRule = new Map<string, LintViolation[]>();
  for (const violation of violations) {
    const existing = byRule.get(violation.rule) ?? [];
    existing.push(violation);
    byRule.set(violation.rule, existing);
  }
  const sections = [...byRule.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([rule, group]) => {
      const lines = group.map(
        (violation) =>
          `  [${violation.severity}] ${violation.file}: ${violation.entityId}: ${violation.message}`,
      );
      return [`${rule} (${group.length}):`, ...lines].join("\n");
    });
  return `${violations.length} rule violation(s):\n${sections.join("\n")}`;
}

/** Formats a full {@link LintResult} — schema errors (if any) followed by rule violations — as a human-readable report for `lint:content`. */
export function formatLintReport(result: LintResult): string {
  const sections: string[] = [];
  if (result.schemaErrors.length > 0) {
    const lines = result.schemaErrors.map(
      (error) => `  ${error.file}: ${error.path}: ${error.message}`,
    );
    sections.push(
      [
        `${result.schemaErrors.length} schema error(s) — content is not even schema-valid:`,
        ...lines,
      ].join("\n"),
    );
  }
  sections.push(formatViolations(result.violations));
  if (result.ok) {
    sections.push("career-data: lint passed — no error-severity violations.");
  }
  return sections.join("\n\n");
}
