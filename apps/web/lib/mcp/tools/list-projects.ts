/**
 * `list-projects` — thin adapter over `packages/core`'s
 * `listProjects(options?)` (#214). Every input field maps 1:1 onto
 * `ListProjectsOptions`; this handler applies no filtering, ranking, or
 * reshaping of its own.
 */

import { type ListProjectsOptions, listProjects } from "@hire-me-mcp/core";
import { z } from "zod";
import { projectSchema } from "../../../src/lib/content/entity-schemas";
import { getCareerDataRepository } from "../../../src/lib/content/repository";
import { nonEmptyStringMessage, type ToolDefinition } from "../define-tool";
import { toolSuccessSchema } from "../wire-schemas";

/**
 * Derived from `listProjects`'s own return type rather than importing
 * `Project` from `@hire-me-mcp/career-data` directly — apps/web reads
 * career content only through `src/lib/content/` (issue #16, enforced by
 * biome).
 */
type Project = ReturnType<typeof listProjects>["data"][number];

const inputSchema = z.object({
  tags: z
    .array(z.string().min(1, { error: () => nonEmptyStringMessage() }))
    .optional()
    .describe(
      "Technology tags to pre-filter by; a project matches if it carries at least one of the " +
        "given tags (OR within this field). Each tag is resolved through the same skill-alias " +
        "index search-projects uses, so 'postgres' and 'postgresql' filter identically. Omit " +
        "for the complete portfolio.",
    ),
});

/** `{ data, citations }` envelope around the full project portfolio (#242). */
const outputSchema = toolSuccessSchema(
  z.array(projectSchema).describe("Every authored project, featured entries first."),
);

/** `list-projects` — registered against a live `McpServer` via `defineTool`. */
export const listProjectsTool: ToolDefinition<typeof inputSchema, Project[]> = {
  name: "list-projects",
  title: "List projects",
  description:
    "Returns every project record — name, summary, role, tech tags, links, and the full " +
    "write-up body — as a complete list in a deterministic order (no relevance ranking, no " +
    "scores), each with a citation, optionally pre-filtered to projects carrying at least one " +
    "given tag. Use this to enumerate the whole project portfolio, e.g. for a CV or profile " +
    "projects section. Do not use it to find projects relevant to a keyword or question — " +
    "use search-projects, which ranks by relevance — or for role-by-role work history (use " +
    "get-experience). A tags filter matching no projects returns a successful empty list, " +
    "not an error.",
  inputSchema,
  outputSchema,
  handler: (input) => {
    const options: ListProjectsOptions = input;
    return listProjects(getCareerDataRepository(), options);
  },
};
