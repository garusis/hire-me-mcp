/**
 * `listWriting(repository)` — enumeration of every writing/publication
 * entry (#215): the full `WritingEntry[]` in the documented stable order,
 * each carrying a citation resolving to it. With today's empty corpus the
 * honest result is an empty list — "nothing published yet" is data, never
 * an error. See README.md for the full documented semantics.
 */

import type { WritingEntry } from "@hire-me-mcp/career-data";
import { buildCitation } from "./citation-builder.js";
import type { CareerDataRepository } from "./repository.js";
import { createDomainResult, type DomainResult } from "./result.js";

/**
 * Stable sort order: `publishedDate` descending (most recent first), ties
 * broken by `id` ascending, so the order is fully deterministic regardless
 * of input array order.
 */
function compareWriting(a: WritingEntry, b: WritingEntry): number {
  if (a.publishedDate !== b.publishedDate) {
    return a.publishedDate < b.publishedDate ? 1 : -1;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

/**
 * Returns every {@link WritingEntry} in `repository`'s dataset — full
 * records, including the MDX `body` — sorted per {@link compareWriting},
 * each with a citation resolving to it (`citations[i]` corresponds to
 * `data[i]`; label = title). An empty corpus returns an empty list and an
 * empty citation array — the honest "nothing published yet" outcome, never
 * a thrown error.
 */
export function listWriting(repository: CareerDataRepository): DomainResult<WritingEntry[]> {
  const { writing } = repository.getDataset();
  const sorted = [...writing].sort(compareWriting);
  const citations = sorted.map((entry) => buildCitation(repository, "writing", entry.id));
  return createDomainResult(sorted, citations);
}
