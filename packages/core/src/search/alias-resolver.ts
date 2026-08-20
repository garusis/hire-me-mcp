/**
 * Generic alias/vocabulary resolution: given an arbitrary collection of
 * `{ canonical, aliases }` entries, resolve any spelling — the canonical name
 * itself or one of its aliases — back to the canonical value.
 *
 * Deliberately domain-agnostic. `searchProjects` (#55) builds an index over
 * skills (`{ canonical: skill.id, aliases: [skill.name, ...skill.aliases] }`)
 * to resolve a query term like `"postgres"` to the controlled-vocabulary tag
 * `"postgresql"`. #56 (`getSkillEvidence`) is expected to reuse this same
 * module unchanged, over skill and gap collections, for the same reason this
 * file does not import anything from `@hire-me-mcp/career-data` — it has no
 * idea what a "skill" or "project" is, only that it was handed canonical
 * values and their alternate spellings.
 */

import { normalizeTerm } from "./normalize.js";

/** One canonical value plus every alternate spelling that should resolve to it. */
export interface AliasedEntry {
  canonical: string;
  aliases: string[];
}

/** A lookup built from a collection of {@link AliasedEntry}. */
export interface AliasIndex {
  /**
   * Resolves `term` — a canonical name or any of its aliases, in any
   * casing/punctuation/diacritic form — to the canonical value it belongs
   * to. Returns `undefined` if `term` (after normalization) matches nothing
   * in the index, including for an empty or whitespace-only term.
   */
  resolve(term: string): string | undefined;
}

/**
 * Builds an {@link AliasIndex} from `entries`. Both each entry's `canonical`
 * value and every one of its `aliases` are indexed under the same
 * normalized key (see `./normalize.js`'s {@link normalizeTerm}), so lookups
 * are case-, punctuation-, diacritic- and whitespace-insensitive, and work
 * for multi-word terms (e.g. `"amazon web services"`) as well as single
 * words. When two entries normalize to the same key, the earliest entry in
 * `entries` wins — deterministic, not last-write-wins.
 */
export function buildAliasIndex(entries: AliasedEntry[]): AliasIndex {
  const lookup = new Map<string, string>();

  for (const entry of entries) {
    const keys = [entry.canonical, ...entry.aliases];
    for (const key of keys) {
      const normalizedKey = normalizeTerm(key);
      if (normalizedKey.length === 0) {
        continue;
      }
      if (!lookup.has(normalizedKey)) {
        lookup.set(normalizedKey, entry.canonical);
      }
    }
  }

  return {
    resolve(term: string): string | undefined {
      const normalizedTerm = normalizeTerm(term);
      if (normalizedTerm.length === 0) {
        return undefined;
      }
      return lookup.get(normalizedTerm);
    },
  };
}
