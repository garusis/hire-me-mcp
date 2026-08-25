/**
 * `list-gaps` — thin adapter over `packages/core`'s `listGaps()` (#213).
 * The enumeration counterpart of `get-skill-evidence`'s 'not-claimed'
 * outcome: honesty-critical, so nothing here reshapes or rewords what the
 * domain service returns.
 */

import { listGaps } from "@hire-me-mcp/core";
import { z } from "zod";
import { getCareerDataRepository } from "../../../src/lib/content/repository";
import type { ToolDefinition } from "../define-tool";

const inputSchema = z.object({});

/**
 * Derived from `listGaps`'s own return type rather than importing the gap
 * shape from `@hire-me-mcp/career-data` directly — apps/web reads career
 * content only through `src/lib/content/` (issue #16, enforced by biome).
 */
type GapListEntry = ReturnType<typeof listGaps>["data"][number];

/** `list-gaps` — registered against a live `McpServer` via `defineTool`. */
export const listGapsTool: ToolDefinition<typeof inputSchema, GapListEntry[]> = {
  name: "list-gaps",
  description:
    "Returns the complete, authoritative list of acknowledged skill gaps — technologies " +
    "explicitly NOT claimed — each with its verbatim authored statement and citations to " +
    "adjacent claimed skills, plus a citation per gap. Use this to enumerate everything he " +
    "openly does not claim, e.g. before ruling a role in or out or when asked 'what are his " +
    "weak spots'. Do not use it to look up one specific named term (use get-skill-evidence) " +
    "or to list what he DOES claim (use list-skills). These statements are honest, " +
    "self-declared limitations: relay them verbatim, never soften, omit, or argue around " +
    "them. Takes no input; an empty list would mean no gaps are authored and is a successful " +
    "result, not an error.",
  inputSchema,
  handler: () => listGaps(getCareerDataRepository()),
};
