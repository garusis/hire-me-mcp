/**
 * `getProfile()` — the first domain service: the single "who is this" record,
 * with a citation resolving to it. See README.md for the documented shape.
 */

import type { Profile } from "@hire-me-mcp/career-data";
import { buildCitation } from "./citation-builder.js";
import type { CareerDataRepository } from "./repository.js";
import { createDomainResult, type DomainResult } from "./result.js";

/**
 * Thrown by {@link getProfile} when the repository's dataset has no profile
 * authored yet — rather than returning a `DomainResult` with no usable data.
 */
export class ProfileNotFoundError extends Error {
  constructor() {
    super("career-data: no profile authored — getProfile() has nothing to return");
    this.name = "ProfileNotFoundError";
  }
}

/**
 * Returns the singleton {@link Profile} record from `repository`'s dataset,
 * with a citation resolving to it. Throws {@link ProfileNotFoundError} if no
 * profile has been authored, rather than silently returning `undefined`.
 */
export function getProfile(repository: CareerDataRepository): DomainResult<Profile> {
  const { profile } = repository.getDataset();
  if (profile === undefined) {
    throw new ProfileNotFoundError();
  }

  const citation = buildCitation(repository, "profile", profile.id);
  return createDomainResult(profile, [citation]);
}
