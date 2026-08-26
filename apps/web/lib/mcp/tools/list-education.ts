/**
 * `list-education` — thin adapter over `packages/core`'s `listEducation()`
 * (#211). No business logic: this handler does not filter, re-rank,
 * summarize, or reword anything the domain service returns.
 */

import { listEducation } from "@hire-me-mcp/core";
import { z } from "zod";
import { educationEntrySchema } from "../../../src/lib/content/entity-schemas";
import { getCareerDataRepository } from "../../../src/lib/content/repository";
import type { ToolDefinition } from "../define-tool";
import { toolSuccessSchema } from "../wire-schemas";

const inputSchema = z.object({});

/**
 * Derived from `listEducation`'s own return type rather than importing
 * `EducationEntry` from `@hire-me-mcp/career-data` directly — apps/web
 * reads career content only through `src/lib/content/` (issue #16,
 * enforced by biome).
 */
type EducationEntry = ReturnType<typeof listEducation>["data"][number];

/** `{ data, citations }` envelope around every authored education entry (#242). */
const outputSchema = toolSuccessSchema(
  z.array(educationEntrySchema).describe("Every authored education entry."),
);

/** `list-education` — registered against a live `McpServer` via `defineTool`. */
export const listEducationTool: ToolDefinition<typeof inputSchema, EducationEntry[]> = {
  name: "list-education",
  title: "List education",
  description:
    "Returns every education record — institution, credential, and optional YYYY-MM start/end " +
    "dates — as a list ordered most recent first, each entry with a citation. Use this to " +
    "answer 'what is his education' or to render the education section of a CV or profile. " +
    "Do not use it for work history (use get-experience), the one-line profile summary (use " +
    "get-profile), or the skills inventory (use list-skills). Takes no input. A missing " +
    "endDate means the credential is honestly still in progress — relay it as such, never " +
    "invent a date; an empty list is a successful 'no education records authored' answer, " +
    "not an error.",
  inputSchema,
  outputSchema,
  handler: () => listEducation(getCareerDataRepository()),
};
