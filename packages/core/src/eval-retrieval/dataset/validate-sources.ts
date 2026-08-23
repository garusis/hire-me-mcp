/**
 * "No dangling ids" validation for the golden retrieval dataset (#41,
 * epic #6's acceptance criterion: "a test validates that every
 * `expectedSources` entry resolves to a real record in the career data").
 * Chunk ids churn whenever chunking is retuned (#21); source ids don't —
 * this checks the golden dataset's `expectedSources` pointers against the
 * SAME `CareerDataset` domain shape `chunkCareerData` (#21) walks, so a
 * typo'd or renamed source id in `./cases.ts` fails a fast, offline test
 * rather than silently under-scoring the eval at run time.
 */

import type { CareerDataset } from "../../repository.js";
import type { GoldenQuery } from "./schema.js";

function sourceKey(sourceType: string, sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

/**
 * Every `"sourceType:sourceId"` key that exists in `dataset` — the same
 * per-entity-type walk `chunkCareerData` (`../../chunking/index.ts`) does,
 * kept independent of it (no import) so this validation never accidentally
 * passes just because chunking and validation share a bug.
 */
export function resolveCareerSourceKeys(dataset: CareerDataset): Set<string> {
  const keys = new Set<string>();
  if (dataset.profile !== undefined) {
    keys.add(sourceKey("profile", dataset.profile.id));
  }
  for (const entry of dataset.experience) {
    keys.add(sourceKey("experience", entry.id));
  }
  for (const project of dataset.projects) {
    keys.add(sourceKey("project", project.id));
  }
  for (const skill of dataset.skills) {
    keys.add(sourceKey("skill", skill.id));
  }
  for (const gap of dataset.gaps) {
    keys.add(sourceKey("gap", gap.id));
  }
  for (const entry of dataset.education) {
    keys.add(sourceKey("education", entry.id));
  }
  for (const entry of dataset.writing) {
    keys.add(sourceKey("writing", entry.id));
  }
  return keys;
}

/** One dangling `expectedSources` reference: a golden query pointing at a source id that doesn't exist in the given career data. */
export interface DanglingSourceReference {
  queryId: string;
  sourceType: string;
  sourceId: string;
}

export interface GoldenDatasetSourceValidation {
  valid: boolean;
  danglingReferences: DanglingSourceReference[];
}

/**
 * Validates every `expectedSources` entry across `queries` resolves to a
 * real record in `dataset`. `absent-topic` entries contribute no
 * references (`expectedSources` is required to be empty for that
 * category — see `./schema.ts`), so they can never produce a false
 * dangling-reference failure.
 */
export function validateGoldenDatasetSources(
  queries: readonly GoldenQuery[],
  dataset: CareerDataset,
): GoldenDatasetSourceValidation {
  const validKeys = resolveCareerSourceKeys(dataset);
  const danglingReferences: DanglingSourceReference[] = [];

  for (const query of queries) {
    for (const source of query.expectedSources) {
      if (!validKeys.has(sourceKey(source.sourceType, source.sourceId))) {
        danglingReferences.push({
          queryId: query.id,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
        });
      }
    }
  }

  return { valid: danglingReferences.length === 0, danglingReferences };
}
