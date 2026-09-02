/**
 * Framework-free domain layer.
 *
 * This package must never depend on React, Next.js, or any HTTP framework —
 * it is consumed by both the web app and the future public MCP endpoint. See
 * README.md for the enforced dependency/import boundary.
 */

export type {
  Chunk,
  ChunkCitation,
  ChunkingOptions,
  ChunkMetadata,
} from "./chunking/index.js";
export {
  CHARS_PER_TOKEN,
  chunkCareerData,
  chunkEducation,
  chunkExperience,
  chunkGap,
  chunkProfile,
  chunkProject,
  chunkRecommendation,
  chunkSkill,
  chunkWriting,
  computeChunkId,
  computeContentHash,
  DEFAULT_MAX_TOKENS,
  DEFAULT_OVERLAP_TOKENS,
  estimateTokens,
  normalizeText,
} from "./chunking/index.js";
export type { BuildCitationOptions } from "./citation-builder.js";
export { buildCitation, UnknownEntityError } from "./citation-builder.js";
export type {
  ContactAccepted,
  ContactEvaluationResult,
  ContactRejected,
  ContactRejectionDetail,
  ContactRejectionReason,
  ContactSubmissionInput,
  HeuristicId,
  NormalizedContactSubmission,
} from "./contact/index.js";
export {
  CONTACT_CONTACT_MAX_LENGTH,
  CONTACT_CONTEXT_MAX_LENGTH,
  CONTACT_HONEYPOT_MAX_LENGTH,
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  contactSubmissionSchema,
  evaluateContactSubmission,
  normalizeContactSubmission,
} from "./contact/index.js";
export type { DependencyAllowlist } from "./dependency-allowlist.js";
export { findDisallowedDependencies } from "./dependency-allowlist.js";
export type { ExperienceFilter } from "./get-experience.js";
export { compareExperience, getExperience } from "./get-experience.js";
export { getProfile, ProfileNotFoundError } from "./get-profile.js";
export type {
  ClaimedSkillOutcome,
  NotClaimedGapOutcome,
  RelatedSkillEvidence,
  SkillEvidenceOutcome,
  UnknownSkillOutcome,
} from "./get-skill-evidence.js";
export { getSkillEvidence } from "./get-skill-evidence.js";
export type {
  CareerStoryFilter,
  CareerStoryListEntry,
  StoryExperienceContext,
} from "./list-career-stories.js";
export { listCareerStories } from "./list-career-stories.js";
export { listEducation } from "./list-education.js";
export type { GapListEntry } from "./list-gaps.js";
export { listGaps } from "./list-gaps.js";
export type { ListProjectsOptions } from "./list-projects.js";
export { listProjects } from "./list-projects.js";
export { listRecommendations } from "./list-recommendations.js";
export type { SkillsFilter } from "./list-skills.js";
export { listSkills } from "./list-skills.js";
export { listWriting } from "./list-writing.js";
export type { CareerDataRepository, CareerDataset } from "./repository.js";
export {
  createContentCareerDataRepository,
  createInMemoryCareerDataRepository,
  emptyCareerDataset,
} from "./repository.js";
export type { Citation, DomainResult } from "./result.js";
export { createDomainResult } from "./result.js";
export type { AliasedEntry, AliasIndex } from "./search/alias-resolver.js";
export { buildAliasIndex } from "./search/alias-resolver.js";
export type {
  MatchExplanation,
  SearchDocument,
  SearchField,
  SearchMatch,
  SearchOptions,
} from "./search/engine.js";
export { search } from "./search/engine.js";
export { normalizeTerm, tokenize } from "./search/normalize.js";
export type { ProjectSearchResult, SearchProjectsOptions } from "./search-projects.js";
export { searchProjects } from "./search-projects.js";
// Re-exported from its own leaf module — see slugify.ts's doc comment —
// rather than defined inline, so `@hire-me-mcp/core/slugify` can be
// imported without pulling in this barrel's `repository.js`
// (`node:fs`/`node:path`) dependency.
export { slugify } from "./slugify.js";

/** Name of this package, exported as a trivial placeholder value. */
export const CORE_PACKAGE_NAME = "@hire-me-mcp/core";
