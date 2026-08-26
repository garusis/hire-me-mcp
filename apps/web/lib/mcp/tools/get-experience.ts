/**
 * `get-experience` — thin adapter over `packages/core`'s `getExperience(filter?)`.
 * Every input field maps 1:1 onto `ExperienceFilter`; this handler applies no
 * filtering, sorting, or reshaping of its own (#31).
 */

import { type ExperienceFilter, getExperience } from "@hire-me-mcp/core";
import { z } from "zod";
import { experienceEntrySchema } from "../../../src/lib/content/entity-schemas";
import { getCareerDataRepository } from "../../../src/lib/content/repository";
import { enumValueMessage, type ToolDefinition } from "../define-tool";
import { toolSuccessSchema } from "../wire-schemas";

/**
 * Derived from `getExperience`'s own return type rather than importing
 * `ExperienceEntry` from `@hire-me-mcp/career-data` directly — apps/web
 * reads career content only through `src/lib/content/` (issue #16, enforced
 * by biome).
 */
type ExperienceEntry = ReturnType<typeof getExperience>["data"][number];

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "must be a YYYY-MM date")
  .describe("Inclusive year-month bound (YYYY-MM), e.g. '2021-06'.");

const inputSchema = z.object({
  company: z
    .string()
    .min(1)
    .optional()
    .describe("Exact company name to filter by, case-insensitive (no fuzzy matching)."),
  tech: z
    .array(z.string().min(1))
    .optional()
    .describe(
      "Technology tags to filter by; an entry matches if it has at least one of the given " +
        "tags (OR within this field). Omit for no constraint.",
    ),
  from: dateSchema.optional().describe("Inclusive lower bound (YYYY-MM) of the role's date range."),
  to: dateSchema.optional().describe("Inclusive upper bound (YYYY-MM) of the role's date range."),
  status: z
    // The explicit error callback keeps the message useful on the MCP
    // SDK's own pre-handler validation path too, where zod's locale-based
    // default can degrade to a bare "Invalid input" in a production
    // bundle (#244).
    .enum(["current", "past"], {
      error: (issue) => enumValueMessage(["current", "past"], issue.input),
    })
    .optional()
    .describe("'current' restricts to the role(s) with no end date; 'past' to roles that ended."),
});

/** `{ data, citations }` envelope around the matching work-history entries (#242). */
const outputSchema = toolSuccessSchema(
  z
    .array(experienceEntrySchema)
    .describe("Matching work-history entries, ordered most recent first."),
);

/** `get-experience` — registered against a live `McpServer` via `defineTool`. */
export const getExperienceTool: ToolDefinition<typeof inputSchema, ExperienceEntry[]> = {
  name: "get-experience",
  title: "Get work experience",
  description:
    "Returns every entry from Marcos Alvarez's work history matching an optional structured " +
    "filter — company, technology tags, a YYYY-MM date range, and current/past status — as a " +
    "list ordered most recent first, each entry with a citation. Use this to answer 'what did " +
    "they do at company X', 'what did they work on in year Y', or 'what are they doing now'. " +
    "Called with no filter fields, it returns the full history. Do not use it for the single " +
    "profile summary (use get-profile), to search project descriptions by keyword (use " +
    "search-projects), or to check whether one named skill is claimed (use " +
    "get-skill-evidence). A filter matching no roles returns a successful result with an empty " +
    "list, not an error.",
  inputSchema,
  outputSchema,
  handler: (input) => {
    const filter: ExperienceFilter = input;
    return getExperience(getCareerDataRepository(), filter);
  },
};
