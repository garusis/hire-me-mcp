/**
 * `get-profile` — thin Mastra adapter over `packages/core`'s `getProfile()`.
 * Same domain service the MCP server's `get-profile` tool wraps
 * (`apps/web/lib/mcp/tools/get-profile.ts`) — this file adds no filtering,
 * re-ranking, summarizing, or rewording of its own (#64, mirroring #31).
 */

import { getProfile } from "@hire-me-mcp/core";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getAgentCareerDataRepository } from "./repository.js";

/** No input fields — the dataset always has exactly one profile. Strict: rejects any field. */
export const getProfileInputSchema = z.object({}).strict();

/** `get-profile` — registered on the interview agent's tool set. */
export const getProfileTool = createTool({
  id: "get-profile",
  description:
    "Returns Marcos Alvarez's single profile record — name, headline, location, " +
    "availability and a short bio — as one object, with citations backing it. Use this to " +
    "answer 'who is this person' or 'what is their current availability/location' at a " +
    "glance. Do not use it for role-by-role work history (use get-experience), specific " +
    "project details (use search-projects), or to check whether a particular skill or " +
    "technology is claimed (use get-skill-evidence). Takes no input.",
  inputSchema: getProfileInputSchema,
  execute: async () => getProfile(getAgentCareerDataRepository()),
});
