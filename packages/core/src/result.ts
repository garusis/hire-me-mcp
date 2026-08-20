/**
 * The shared response envelope every domain service in `packages/core`
 * returns: a result payload alongside the machine-readable citations that
 * back it. Per the locked architecture decision, this is not optional —
 * every service response carries `citations`, even when empty, so callers
 * can render sources without parsing prose.
 */

import type { Citation } from "@hire-me-mcp/career-data";

export type { Citation };

/** A domain-service response: `data` plus the `Citation[]` that support it. */
export interface DomainResult<T> {
  data: T;
  citations: Citation[];
}

/** Constructs a {@link DomainResult}. A thin factory so services build the envelope consistently. */
export function createDomainResult<T>(data: T, citations: Citation[]): DomainResult<T> {
  return { data, citations };
}
