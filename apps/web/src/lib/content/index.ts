/**
 * `apps/web`'s single server-side path to career content. Every page,
 * layout, and `generateStaticParams` reads career facts exclusively through
 * this barrel — never by importing `@hire-me-mcp/career-data` directly (see
 * `content-source-guard.test.ts` and the `noRestrictedImports` Biome
 * override scoped to `apps/web/**` outside this directory).
 */

import "server-only";

// Re-exported so the (placeholder) home page can display the career-data
// package name without importing `@hire-me-mcp/career-data` itself — every
// value `apps/web` renders comes from this barrel, including this one.
export { CAREER_DATA_PACKAGE_NAME } from "@hire-me-mcp/career-data";
export {
  type CvExperienceItemView,
  CvProfileNotFoundError,
  type CvSkillGroupView,
  type CvView,
  type GetCvViewOptions,
  getCvView,
} from "./cv";
export {
  type EducationListItemView,
  type EducationListView,
  getEducationListView,
} from "./education";
export {
  type ExperienceEntryView,
  type ExperienceListItemView,
  type ExperienceListView,
  getExperienceEntryView,
  getExperienceListView,
  listExperienceSlugs,
} from "./experience";
export { type GapListItemView, type GapsListView, getGapsListView } from "./gaps";
export { getProfileView, type ProfileView } from "./profile";
export {
  getProjectDetailView,
  getProjectsListView,
  listProjectSlugs,
  type ProjectDetailView,
  type ProjectListItemView,
  type ProjectListView,
} from "./projects";
export {
  getSkillEvidenceView,
  getSkillsListView,
  type Skill,
  type SkillEvidenceView,
  type SkillsListView,
} from "./skills";
export {
  type FoundBySlug,
  findBySlug,
  listSlugs,
  type NotFoundBySlug,
  type SlugLookup,
  toSlug,
} from "./slug";
export {
  getWritingEntryView,
  getWritingListView,
  listWritingSlugs,
  type WritingEntry,
  type WritingEntryView,
  type WritingListItemView,
  type WritingListView,
} from "./writing";
