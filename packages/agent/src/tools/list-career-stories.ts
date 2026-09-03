/**
 * `list-career-stories` — thin Mastra adapter over `packages/core`'s
 * `listCareerStories(repository, filter?)` (#291, epic #288). Same domain
 * service the MCP server's `list-career-stories` tool wraps
 * (`apps/web/lib/mcp/tools/list-career-stories.ts`); every input field maps
 * 1:1 onto `CareerStoryFilter` — no filtering, sorting, or reshaping of its
 * own (#64, mirroring #31). This is the deterministic, complete-story path
 * for behavioral "tell me about a time" questions — the semantic path is
 * `search-career` scoped to `sourceTypes: ["story"]` (see
 * `./search-career.ts` and `../prompt/sections.ts`'s retrieval policy);
 * there is deliberately no story-specific search tool (#294).
 *
 * `competencies` is validated against the controlled `COMPETENCIES` enum,
 * matching the MCP surface's version's strict input semantics (#294) —
 * `packages/agent` depends only on `@hire-me-mcp/core`, not
 * `@hire-me-mcp/career-data` directly (architecture boundary), so the enum
 * is imported from `@hire-me-mcp/core`'s own re-export of it rather than
 * from `@hire-me-mcp/career-data` directly.
 */

import { type CareerStoryFilter, COMPETENCIES, listCareerStories } from "@hire-me-mcp/core";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { withCitationMarkers } from "./citation-markers.js";
import { getAgentCareerDataRepository } from "./repository.js";

/** Bounded length: model-driven input from untrusted visitor text. */
const exactMatchSchema = () => z.string().min(1).max(200);

export const listCareerStoriesInputSchema = z
  .object({
    id: exactMatchSchema()
      .optional()
      .describe(
        "Exact story id (case-insensitive) to fetch one specific story, e.g. after search-career " +
          "surfaced it as a 'story' source. Omit to filter by the other fields instead.",
      ),
    experienceId: exactMatchSchema()
      .optional()
      .describe(
        "Exact experience id (as returned by get-experience). Matches stories whose primary " +
          "experience — where the event occurred — OR one of their related experiences has this " +
          "id. Omit for no constraint.",
      ),
    company: exactMatchSchema()
      .optional()
      .describe(
        "Exact company name, case-insensitive (no fuzzy matching), matched against the primary " +
          "or a related experience. Omit for no constraint.",
      ),
    competencies: z
      .array(z.enum(COMPETENCIES))
      .optional()
      .describe(
        "Controlled behavioral competencies to filter by — every allowed value is listed in " +
          "this field's enum, e.g. 'leadership', 'ownership'. A story matches if ANY given " +
          "value is its primary competency or one of its supporting competencies (OR within " +
          "this field); stories matched on their primary competency are listed first. Omit, " +
          "or pass an empty array, for no constraint.",
      ),
  })
  .strict();

/** `list-career-stories` — registered on the interview agent's tool set. */
export const listCareerStoriesTool = createTool({
  id: "list-career-stories",
  description:
    "Returns Marcos Alvarez's complete behavioral career stories — each one a concrete event " +
    "told as situation, task, ordered actions, results, and an optional reflection, tagged with " +
    "one primary and up to five supporting competencies — matching an optional structured " +
    "filter: exact story id, exact experience id, exact company (case-insensitive), and/or " +
    "competencies (a story matches if any given competency is its primary or a supporting one; " +
    "fields combine with AND). Every item carries the full story plus compact context for the " +
    "primary role where the event occurred (id, company, role, dates), any distinctly labeled " +
    "related roles, and a citation. Use this FIRST for behavioral, 'tell me about a time' " +
    "questions — leadership, ownership, conflict, ambiguity, stakeholder management, failure, " +
    "decision making — whenever the competency, company, or experience id is known: it is " +
    "deterministic and returns the whole story. Do not use it for chronological company, role, " +
    "date, or technology history (use get-experience), and do not look for a search-stories " +
    "tool — none exists. For fuzzy behavioral phrasing that does not confidently map to a " +
    "listed competency, call search-career first with sourceTypes: ['story'] and then fetch the " +
    "matching story here by id. A filter matching no stories returns a successful empty list, " +
    "not an error.",
  inputSchema: listCareerStoriesInputSchema,
  execute: async (input) => {
    const filter: CareerStoryFilter = input;
    return withCitationMarkers(listCareerStories(getAgentCareerDataRepository(), filter));
  },
});
