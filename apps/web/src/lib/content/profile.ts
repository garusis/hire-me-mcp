/** Typed accessor wrapping `packages/core`'s `getProfile()`. */

import "server-only";
import type { Citation, Profile } from "@hire-me-mcp/career-data";
import { getProfile } from "@hire-me-mcp/core";
import { getCareerDataRepository } from "./repository";

/** View model for the site's singleton profile. */
export interface ProfileView {
  profile: Profile;
  citations: Citation[];
}

/**
 * Returns the site's profile view model, built from `packages/core`'s
 * `getProfile()`. `packages/core` throws `ProfileNotFoundError` if no
 * profile has been authored — this accessor does not catch it: an
 * unauthored profile is a build-breaking content error, not a renderable
 * "empty" state.
 */
export function getProfileView(): ProfileView {
  const result = getProfile(getCareerDataRepository());
  return { profile: result.data, citations: result.citations };
}
