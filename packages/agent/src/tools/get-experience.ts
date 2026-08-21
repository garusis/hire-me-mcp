/**
 * `get-experience` — thin Mastra adapter over `packages/core`'s
 * `getExperience(filter?)`. Same domain service the MCP server's
 * `get-experience` tool wraps (`apps/web/lib/mcp/tools/get-experience.ts`);
 * every input field maps 1:1 onto `ExperienceFilter` with no filtering,
 * sorting, or reshaping of its own (#64, mirroring #31).
 */

import { type ExperienceFilter, getExperience } from "@hire-me-mcp/core";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getAgentCareerDataRepository } from "./repository.js";

/**
 * Bounded lengths on every free-text/array field: this schema validates
 * input produced by a model influenced by untrusted visitor text, not
 * trusted developer input, so every unbounded string/array in the MCP
 * equivalent gets an explicit ceiling here.
 */
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "must be a YYYY-MM date")
  .describe("Inclusive year-month bound (YYYY-MM), e.g. '2021-06'.");

export const getExperienceInputSchema = z
  .object({
    company: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe("Exact company name to filter by, case-insensitive (no fuzzy matching)."),
    tech: z
      .array(z.string().min(1).max(100))
      .max(20)
      .optional()
      .describe(
        "Technology tags to filter by; an entry matches if it has at least one of the given " +
          "tags (OR within this field). Omit for no constraint.",
      ),
    from: dateSchema
      .optional()
      .describe("Inclusive lower bound (YYYY-MM) of the role's date range."),
    to: dateSchema.optional().describe("Inclusive upper bound (YYYY-MM) of the role's date range."),
    status: z
      .enum(["current", "past"])
      .optional()
      .describe("'current' restricts to the role(s) with no end date; 'past' to roles that ended."),
  })
  .strict();

/** `get-experience` — registered on the interview agent's tool set. */
export const getExperienceTool = createTool({
  id: "get-experience",
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
  inputSchema: getExperienceInputSchema,
  execute: async (input) => {
    const filter: ExperienceFilter = input;
    return getExperience(getAgentCareerDataRepository(), filter);
  },
});
