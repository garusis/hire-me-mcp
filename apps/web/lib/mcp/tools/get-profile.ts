/**
 * `get-profile` — thin adapter over `packages/core`'s `getProfile()`. No
 * business logic: this handler does not filter, re-rank, summarize, or
 * reword anything the domain service returns (#31).
 */

import { getProfile } from "@hire-me-mcp/core";
import { z } from "zod";
import { profileSchema } from "../../../src/lib/content/entity-schemas";
import { getCareerDataRepository } from "../../../src/lib/content/repository";
import type { ToolDefinition } from "../define-tool";
import { toolSuccessSchema } from "../wire-schemas";

const inputSchema = z.object({});

/**
 * Derived from `getProfile`'s own return type rather than importing `Profile`
 * from `@hire-me-mcp/career-data` directly — apps/web reads career content
 * only through `src/lib/content/` (issue #16, enforced by biome).
 */
type Profile = ReturnType<typeof getProfile>["data"];

/** `{ data, citations }` envelope around the single authored profile record (#242). */
const outputSchema = toolSuccessSchema(
  profileSchema.describe("The single authored profile record."),
);

/** `get-profile` — registered against a live `McpServer` via `defineTool`. */
export const getProfileTool: ToolDefinition<typeof inputSchema, Profile> = {
  name: "get-profile",
  title: "Get profile",
  description:
    "Returns Marcos Alvarez's single profile record — name, headline, location, " +
    "availability and a short bio — as one object, with citations backing it. Use this to " +
    "answer 'who is this person' or 'what is their current availability/location' at a " +
    "glance. Do not use it for role-by-role work history (use get-experience), specific " +
    "project details (use search-projects), or to check whether a particular skill or " +
    "technology is claimed (use get-skill-evidence). Takes no input. There is no 'no result' " +
    "outcome in normal operation — this server's dataset always has exactly one profile.",
  inputSchema,
  outputSchema,
  handler: () => getProfile(getCareerDataRepository()),
};
