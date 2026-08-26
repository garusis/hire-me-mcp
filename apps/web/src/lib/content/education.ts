/**
 * Typed accessor wrapping `packages/core`'s `listEducation()` (#231) — the
 * same dataset the CV PDF's EDUCATION section and the MCP `list-education`
 * tool already publish, now readable by the site so the three surfaces
 * can't disagree about what exists.
 */

import "server-only";
import type { Citation, EducationEntry } from "@hire-me-mcp/career-data";
import { listEducation } from "@hire-me-mcp/core";
import { getCareerDataRepository } from "./repository";

/** One education credential, paired with the citation resolving to it. */
export interface EducationListItemView {
  entry: EducationEntry;
  citation: Citation;
}

export interface EducationListView {
  items: EducationListItemView[];
}

/**
 * Every education record in `listEducation`'s documented stable order
 * (most recent first, in-progress credentials leading). An empty dataset
 * yields an empty list — the caller renders nothing rather than a hollow
 * section.
 */
export function getEducationListView(): EducationListView {
  const result = listEducation(getCareerDataRepository());
  const items = result.data.map((entry, index) => {
    const citation = result.citations[index];
    if (citation === undefined) {
      throw new Error(`career-data: listEducation returned no citation for "${entry.id}"`);
    }
    return { entry, citation };
  });
  return { items };
}
