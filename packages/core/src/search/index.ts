/**
 * The reusable search module's own public surface, separate from
 * `../search-projects.ts` (its first consumer) so #56 (`getSkillEvidence`)
 * can build a second consumer — skill/gap lookup — directly on this same
 * module without depending on anything project-specific.
 */

export type { AliasedEntry, AliasIndex } from "./alias-resolver.js";
export { buildAliasIndex } from "./alias-resolver.js";
export type {
  MatchExplanation,
  SearchDocument,
  SearchField,
  SearchMatch,
  SearchOptions,
} from "./engine.js";
export { search } from "./engine.js";
export { normalizeTerm, tokenize } from "./normalize.js";
