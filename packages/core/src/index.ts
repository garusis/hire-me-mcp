/**
 * Framework-free domain layer.
 *
 * This package must never depend on React, Next.js, or any HTTP framework —
 * it is consumed by both the web app and the future public MCP endpoint. See
 * README.md for the enforced dependency/import boundary.
 */

export type { BuildCitationOptions } from "./citation-builder.js";
export { buildCitation, UnknownEntityError } from "./citation-builder.js";
export type { DependencyAllowlist } from "./dependency-allowlist.js";
export { findDisallowedDependencies } from "./dependency-allowlist.js";
export type { ExperienceFilter } from "./get-experience.js";
export { getExperience } from "./get-experience.js";
export { getProfile, ProfileNotFoundError } from "./get-profile.js";
export type { CareerDataRepository, CareerDataset } from "./repository.js";
export {
  createContentCareerDataRepository,
  createInMemoryCareerDataRepository,
  emptyCareerDataset,
} from "./repository.js";
export type { Citation, DomainResult } from "./result.js";
export { createDomainResult } from "./result.js";

/** Name of this package, exported as a trivial placeholder value. */
export const CORE_PACKAGE_NAME = "@hire-me-mcp/core";

/**
 * Convert arbitrary text into a URL-safe slug: lowercased, trimmed,
 * non-alphanumeric runs collapsed to a single hyphen, no leading/trailing
 * hyphens.
 *
 * A small but real piece of domain-agnostic logic — used to prove the
 * Vitest pipeline exercises actual exported behavior, not a placeholder.
 */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
