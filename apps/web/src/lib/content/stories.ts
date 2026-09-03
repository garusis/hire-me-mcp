/**
 * The story → parent-experience lookup the citation resolvers need (#293,
 * epic #288). A `story` citation must stay `entityType: "story"` for
 * precise grounding, yet the site deliberately renders no story page
 * (#288's visibility boundary), so its clickable URL points at the primary
 * experience entry on `/experience#<experience-id>` instead — the page
 * verifies the employment context; the story body itself is only ever
 * returned through the MCP/chat interfaces that were explicitly asked.
 *
 * This accessor therefore exposes exactly the two ids that mapping needs
 * and nothing else: no title, narrative, competencies or tags ever reach
 * a page through it.
 *
 * Optionally takes a `CareerDataRepository`, defaulting to the shared
 * real-content one, so tests can inject an in-memory fixture (the same seam
 * `recommendations.ts` documents).
 */

import "server-only";
import type { CareerDataRepository } from "@hire-me-mcp/core";
import { getCareerDataRepository } from "./repository";

/** A story's id and the single primary experience where its event occurred. */
export interface StoryParentRef {
  storyId: string;
  experienceId: string;
}

/** Every authored story's parent pointer, in dataset order. */
export function listStoryParents(
  repository: CareerDataRepository = getCareerDataRepository(),
): StoryParentRef[] {
  return repository
    .getDataset()
    .stories.map((story) => ({ storyId: story.id, experienceId: story.experienceId }));
}
