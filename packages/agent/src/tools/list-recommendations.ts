/**
 * `list-recommendations` — thin Mastra adapter over `packages/core`'s
 * `listRecommendations()` (#190). Same domain service the MCP server's
 * `list-recommendations` tool wraps
 * (`apps/web/lib/mcp/tools/list-recommendations.ts`); no filtering,
 * sorting, or reshaping of its own (#64, mirroring #31).
 */

import { listRecommendations } from "@hire-me-mcp/core";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getAgentCareerDataRepository } from "./repository.js";

export const listRecommendationsInputSchema = z.object({}).strict();

/** `list-recommendations` — registered on the interview agent's tool set. */
export const listRecommendationsTool = createTool({
  id: "list-recommendations",
  description:
    "Returns every recommendation Marcos Alvarez has received on LinkedIn — recommender name, " +
    "their title at the time of writing, the working relationship (e.g. direct manager, peer, " +
    "report), the date, and the full recommendation text verbatim — as a list ordered most " +
    "recent first, each entry with a citation and two verification links: the recommender's " +
    "LinkedIn profile URL and the recommendations section of Marcos's LinkedIn profile " +
    "(LinkedIn has no per-recommendation permalinks). Use this when a user asks for " +
    "references, testimonials, or recommendations, or what managers and colleagues say about " +
    "working with Marcos. Do not use it for the role-by-role work history itself (use " +
    "get-experience), the single profile summary (use get-profile), or to check whether a " +
    "specific skill is claimed (use get-skill-evidence). Takes no input. An empty list is a " +
    "normal, successful result — it means no recommendations are authored yet, not an error.",
  inputSchema: listRecommendationsInputSchema,
  execute: async () => {
    return listRecommendations(getAgentCareerDataRepository());
  },
});
