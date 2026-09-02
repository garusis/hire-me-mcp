/**
 * Zod entity schemas re-exported through the content-layer seam (#16): the
 * MCP tool layer (`lib/mcp`) declares `outputSchema`s (#242) built from the
 * same schemas the career dataset itself is validated with, but `apps/web`
 * outside `src/lib/content/` may not import `@hire-me-mcp/career-data`
 * directly (Biome `noRestrictedImports`). A leaf module — not the barrel —
 * so importing a schema never drags `server-only` or the content loader
 * into a consumer that only needs shapes.
 */

export {
  COMPETENCIES,
  careerStorySchema,
  citationSchema,
  educationEntrySchema,
  experienceEntrySchema,
  gapSchema,
  profileSchema,
  projectSchema,
  recommendationSchema,
  skillSchema,
  writingEntrySchema,
} from "@hire-me-mcp/career-data";
