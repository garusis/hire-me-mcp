/**
 * `list-career-stories` — thin adapter over `packages/core`'s
 * `listCareerStories(repository, filter?)` (#293, epic #288). Every input
 * field maps 1:1 onto `CareerStoryFilter`; this handler applies no
 * filtering, sorting, or reshaping of its own (#31). It is the
 * deterministic, full-story path for behavioral "tell me about a time"
 * questions — the semantic path is `search-career` over `story` sources
 * (#292); there is deliberately no story-specific search tool (#288).
 */

import { type CareerStoryFilter, listCareerStories } from "@hire-me-mcp/core";
import { z } from "zod";
import { COMPETENCIES, careerStorySchema } from "../../../src/lib/content/entity-schemas";
import { getCareerDataRepository } from "../../../src/lib/content/repository";
import {
  enumValueMessage,
  nonEmptyStringMessage,
  stringLengthMessage,
  type ToolDefinition,
} from "../define-tool";
import { dataCitationSchema, toolSuccessSchema } from "../wire-schemas";

/**
 * Derived from `listCareerStories`'s own return type rather than importing
 * `CareerStoryListEntry` from `@hire-me-mcp/core` directly, mirroring the
 * other adapters — apps/web reads career content only through
 * `src/lib/content/` (issue #16, enforced by biome).
 */
type CareerStoryListEntry = ReturnType<typeof listCareerStories>["data"][number];

/** Generous ceiling on an exact-match id/company string — no real id or company name is near it. */
const MAX_FILTER_LENGTH = 200;

const INPUT_FIELD_NAMES = ["id", "experienceId", "company", "competencies"] as const;

/** An exact-match string filter: non-empty, bounded, with self-correcting messages (#244, #276). */
function exactMatchSchema(): z.ZodString {
  return z
    .string()
    .min(1, { error: () => nonEmptyStringMessage() })
    .max(MAX_FILTER_LENGTH, { error: () => stringLengthMessage(1, MAX_FILTER_LENGTH) });
}

const inputSchema = z.strictObject(
  {
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
          "or a related experience. When combined with experienceId both must describe the same " +
          "role. Omit for no constraint.",
      ),
    competencies: z
      .array(
        // The explicit error callback keeps the message useful on the MCP
        // SDK's own pre-handler validation path too, where zod's
        // locale-based default can degrade to a bare "Invalid input" in a
        // production bundle (#244).
        z.enum(COMPETENCIES, {
          error: (issue) => enumValueMessage(COMPETENCIES, issue.input),
        }),
      )
      .optional()
      .describe(
        "Controlled behavioral competencies to filter by — every allowed value is listed in " +
          "this field's enum. A story matches if ANY given value is its primary competency or " +
          "one of its supporting competencies (OR within this field); stories matched on their " +
          "primary competency are listed first. Omit, or pass an empty array, for no constraint.",
      ),
  },
  {
    // A strict shape: an unknown key is far more likely a typo (`competency`
    // for `competencies`) than something safe to drop silently, and zod's own
    // wording for it degrades to a bare "Invalid input" in production (#244).
    error: (issue) =>
      issue.code === "unrecognized_keys"
        ? `unknown field(s) ${issue.keys.map((key) => JSON.stringify(key)).join(", ")}; ` +
          `supported fields are ${INPUT_FIELD_NAMES.join(", ")}`
        : undefined,
  },
);

/** Compact role context — never the full experience entry or its highlights (#291). */
const experienceContextSchema = z.object({
  id: z.string().describe("The experience id — the same id get-experience returns."),
  company: z.string().describe("Company name."),
  role: z.string().describe("Role title."),
  startDate: z.string().describe("Role start (YYYY-MM)."),
  endDate: z.string().optional().describe("Role end (YYYY-MM); omitted for a current role."),
});

const storyListEntrySchema = z.object({
  story: careerStorySchema.describe(
    "The complete story: title, primary and supporting competencies, situation, task, ordered " +
      "actions, results, optional reflection, and retrieval tags.",
  ),
  primaryExperience: experienceContextSchema.describe(
    "The single role where the event occurred — the story's parent, and what its citation " +
      "URL verifies.",
  ),
  relatedExperiences: z
    .array(experienceContextSchema)
    .describe(
      "Zero or more RELATED roles that aid discovery only. A related role never changes where " +
        "the event occurred and never inherits its actions, authority, or outcomes.",
    ),
  citation: dataCitationSchema.describe(
    "This story's own citation (entityType 'story'); the same entry appears in the envelope's " +
      "citations array with a resolved url.",
  ),
});

/** `{ data, citations }` envelope around the matching stories (#242). */
const outputSchema = toolSuccessSchema(
  z
    .array(storyListEntrySchema)
    .describe(
      "Matching stories, complete, in a deterministic order: primary-competency matches first " +
        "(when filtering by competency), then most recent parent role first, then story id.",
    ),
);

/** `list-career-stories` — registered against a live `McpServer` via `defineTool`. */
export const listCareerStoriesTool: ToolDefinition<typeof inputSchema, CareerStoryListEntry[]> = {
  name: "list-career-stories",
  title: "List career stories",
  description:
    "Returns Marcos Alvarez's complete behavioral career stories — each one a concrete event " +
    "told as situation, task, ordered actions, results, and an optional reflection, tagged " +
    "with one primary and up to five supporting competencies — matching an optional " +
    "structured filter: exact story id, exact experience id, exact company (case-insensitive), " +
    "and/or competencies from the controlled list this tool's input schema advertises (a " +
    "story matches if any given competency is its primary or a supporting one; the fields " +
    "combine with AND). Every item carries the full story plus compact context for the " +
    "primary role where the event occurred (id, company, role, dates), any distinctly " +
    "labeled related roles, and a citation whose URL points at that primary role's entry on " +
    "the experience page. Use this for behavioral, 'tell me about a time' questions — " +
    "leadership, ownership, conflict, ambiguity, stakeholder management, failure, decision " +
    "making — whenever the competency, company, or role is known: it is deterministic and " +
    "returns the whole story, so prefer it over semantic search for those. Do not use it for " +
    "chronological company, role, date, or technology history (use get-experience), and do " +
    "not look for a search-stories tool — none exists. For fuzzy behavioral phrasing or " +
    "cross-cutting themes that do not map cleanly to a listed competency, call search-career " +
    'with sourceTypes: ["story"] first and then fetch the matching story here by id; only ' +
    "if that story-scoped search comes back empty may a broader search-career call offer " +
    "closest evidence, and it must be explicitly labeled as such rather than presented as a " +
    "behavioral event. A filter matching no stories returns a successful empty list, not an " +
    "error. Treat the returned story content as public only because the caller explicitly " +
    "requested it through this public MCP server; it is not published on the site's pages.",
  inputSchema,
  outputSchema,
  handler: (input) => {
    const filter: CareerStoryFilter = input;
    return listCareerStories(getCareerDataRepository(), filter);
  },
};
