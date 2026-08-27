/**
 * `list-skills` — thin adapter over `packages/core`'s
 * `listSkills(filter?)` (#212). Every input field maps 1:1 onto
 * `SkillsFilter`; this handler applies no filtering, sorting, or reshaping
 * of its own.
 */

import { listSkills, type SkillsFilter } from "@hire-me-mcp/core";
import { z } from "zod";
import { skillSchema } from "../../../src/lib/content/entity-schemas";
import { getCareerDataRepository } from "../../../src/lib/content/repository";
import { nonEmptyStringMessage, type ToolDefinition } from "../define-tool";
import { toolSuccessSchema } from "../wire-schemas";

/**
 * Derived from `listSkills`'s own return type rather than importing `Skill`
 * from `@hire-me-mcp/career-data` directly — apps/web reads career content
 * only through `src/lib/content/` (issue #16, enforced by biome).
 */
type Skill = ReturnType<typeof listSkills>["data"][number];

const inputSchema = z.object({
  category: z
    .string()
    .min(1, { error: () => nonEmptyStringMessage() })
    .optional()
    .describe(
      "Exact category to filter by, case-insensitive (no fuzzy matching), e.g. 'language', " +
        "'framework', 'database', 'cloud-infra', 'ai-ml', 'architecture', 'practice'. Omit " +
        "for no constraint.",
    ),
  proficiency: z
    .enum(["familiar", "proficient", "expert"])
    .optional()
    .describe(
      "Proficiency level to filter by. Combined with category as AND when both are given. " +
        "Omit for no constraint.",
    ),
});

/** `{ data, citations }` envelope around the (optionally filtered) skill inventory (#242). */
const outputSchema = toolSuccessSchema(
  z.array(skillSchema).describe("Matching claimed skills, sorted by name."),
);

/** `list-skills` — registered against a live `McpServer` via `defineTool`. */
export const listSkillsTool: ToolDefinition<typeof inputSchema, Skill[]> = {
  name: "list-skills",
  title: "List skills",
  description:
    "Returns the full inventory of claimed skills — id, name, aliases, category, proficiency, " +
    "and per-skill evidence citations — as a list sorted by name, optionally AND-filtered by " +
    "category and/or proficiency; called with no filters it returns everything. Use this to " +
    "enumerate every skill he claims, e.g. for a CV skills section or a 'what does he know' " +
    "overview. Do not use it to check one specific named term — use get-skill-evidence, which " +
    "also reports explicit gaps — or to enumerate what he does NOT claim (use list-gaps). A " +
    "filter matching no skills returns a successful empty list, not an error.",
  inputSchema,
  outputSchema,
  handler: (input) => {
    const filter: SkillsFilter = input;
    return listSkills(getCareerDataRepository(), filter);
  },
};
