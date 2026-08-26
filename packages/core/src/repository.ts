/**
 * The single seam through which `packages/core` reads career data.
 *
 * Every domain service depends on the {@link CareerDataRepository} interface,
 * never on `@hire-me-mcp/career-data`'s loader directly, so the data source
 * can later be swapped (e.g. for the RAG index in epic #6) without touching
 * service code — and so tests can inject an in-memory fixture dataset with
 * no filesystem access at all.
 */

import type { CareerDataset } from "@hire-me-mcp/career-data";
import { loadContentDir, resolveDefaultContentDir } from "@hire-me-mcp/career-data";

export type { CareerDataset };

/** An empty, valid dataset — the "nothing authored yet" starting point. */
export function emptyCareerDataset(): CareerDataset {
  return {
    profile: undefined,
    experience: [],
    projects: [],
    skills: [],
    gaps: [],
    education: [],
    writing: [],
    recommendations: [],
  };
}

/**
 * Read access to the full, validated career dataset. Data is static and
 * validated at build time, so implementations are expected to load eagerly
 * (on first access) and memoize — `getDataset()` never re-reads its source.
 */
export interface CareerDataRepository {
  getDataset(): CareerDataset;
}

/**
 * Test double: wraps an already-built dataset (typically hand-written
 * fixtures) with no filesystem access whatsoever. Use this to run a service
 * fully against injected data in unit tests.
 */
export function createInMemoryCareerDataRepository(dataset: CareerDataset): CareerDataRepository {
  return {
    getDataset: () => dataset,
  };
}

export interface ContentCareerDataRepositoryOptions {
  /** Defaults to `@hire-me-mcp/career-data`'s own `content/` directory. */
  contentDir?: string;
  /**
   * Passed through to `loadContentDir`. `false` (the default) means a
   * missing content directory, or one that yields zero entities, throws
   * instead of silently producing an empty dataset (#113) — flip this to
   * `true` only for a caller that's genuinely fine with "nothing authored
   * yet" (e.g. early-scaffolding fixtures), never as a way to paper over a
   * misconfigured `contentDir`.
   */
  allowEmpty?: boolean;
  /** Injection point for tests that need to count/observe load calls. Defaults to `loadContentDir`. */
  load?: (contentDir: string, options?: { allowEmpty?: boolean }) => CareerDataset;
}

/**
 * Default implementation: reads the validated content from
 * `packages/career-data` through its `loadContentDir` loader — the "one
 * loader/repository module" `packages/core` is required to funnel all
 * content reads through, rather than reading files ad hoc.
 *
 * Loads on the first `getDataset()` call and memoizes the result — the
 * content directory is read at most once, however many times `getDataset()`
 * is called afterward.
 */
export function createContentCareerDataRepository(
  options: ContentCareerDataRepositoryOptions = {},
): CareerDataRepository {
  const contentDir = options.contentDir ?? resolveDefaultContentDir();
  const allowEmpty = options.allowEmpty ?? false;
  const load = options.load ?? loadContentDir;
  let cached: CareerDataset | undefined;

  return {
    getDataset(): CareerDataset {
      if (cached === undefined) {
        cached = load(contentDir, { allowEmpty });
      }
      return cached;
    },
  };
}
