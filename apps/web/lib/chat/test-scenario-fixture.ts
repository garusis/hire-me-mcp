/**
 * Binds the scripted chat scenarios (`./test-scenarios.ts`, #264) to REAL
 * career-data ids.
 *
 * The scripted answer must be deterministic *and* honest: every citation
 * marker in it points at content that actually exists, so the link the chat
 * UI renders for it resolves to a real page and a real fragment. Faking the
 * ids would make the required preview assertion "a citation renders as a
 * link" true while "a citation resolves to something" stayed unproven —
 * which is most of the value.
 *
 * Read through `@hire-me-mcp/core`, never `@hire-me-mcp/career-data`
 * directly — the same import boundary `biome.json`'s `noRestrictedImports`
 * enforces for the rest of `apps/web`, and the same one
 * `e2e-preview/helpers/dataset.ts` observes.
 *
 * Entity types the real dataset can legitimately have none of (writing
 * entries are unauthored today) fall back to a syntactically valid
 * placeholder id. That is deliberate rather than a skipped marker: the site
 * resolves an unknown `writing` id to `/writing`, a real page, so the
 * "every citable entity type is exercised" guarantee holds either way, and
 * the fallback never silently disappears — it is the only id in the fixture
 * that isn't authored content.
 */

import { createContentCareerDataRepository } from "@hire-me-mcp/core";
import type { ChatTestCitationIds } from "./test-scenarios";

/** Placeholder ids, used only when the real dataset has no entry of that type. */
const FALLBACK_IDS: ChatTestCitationIds = {
  experience: "unauthored-experience",
  project: "unauthored-project",
  skill: "unauthored-skill",
  gap: "unauthored-gap",
  writing: "unauthored-writing",
  profile: "unauthored-profile",
  education: "unauthored-education",
  recommendation: "unauthored-recommendation",
};

function firstId(entries: ReadonlyArray<{ id: string }>, fallback: string): string {
  return entries[0]?.id ?? fallback;
}

let cached: ChatTestCitationIds | undefined;

/** The citation ids the scripted answer uses — resolved once per process (the repository memoizes its own read). */
export function readChatTestCitationIds(): ChatTestCitationIds {
  if (cached !== undefined) {
    return cached;
  }
  const dataset = createContentCareerDataRepository().getDataset();
  cached = {
    experience: firstId(dataset.experience, FALLBACK_IDS.experience),
    project: firstId(dataset.projects, FALLBACK_IDS.project),
    skill: firstId(dataset.skills, FALLBACK_IDS.skill),
    gap: firstId(dataset.gaps, FALLBACK_IDS.gap),
    writing: firstId(dataset.writing, FALLBACK_IDS.writing),
    profile: dataset.profile?.id ?? FALLBACK_IDS.profile,
    education: firstId(dataset.education, FALLBACK_IDS.education),
    recommendation: firstId(dataset.recommendations, FALLBACK_IDS.recommendation),
  };
  return cached;
}
