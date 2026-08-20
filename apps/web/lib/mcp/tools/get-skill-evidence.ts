/**
 * `get-skill-evidence` — thin adapter over `packages/core`'s
 * `getSkillEvidence(term)`. The honesty-critical tool in this server: a
 * "not-claimed" (gap) or "unknown" outcome is a normal, successful result,
 * never converted to an empty list or an error (#32).
 */

import { getSkillEvidence } from "@hire-me-mcp/core";
import { z } from "zod";
import { getCareerDataRepository } from "../../../src/lib/content/repository";
import type { ToolDefinition } from "../define-tool";

/**
 * Derived from `getSkillEvidence`'s own return type rather than importing
 * `Skill`/`Gap` from `@hire-me-mcp/career-data` directly — apps/web reads
 * career content only through `src/lib/content/` (issue #16, enforced by
 * biome).
 */
type SkillEvidenceOutcome = ReturnType<typeof getSkillEvidence>["data"];

const inputSchema = z.object({
  term: z
    .string()
    .min(1)
    .describe(
      "Skill or technology name to look up, e.g. 'TypeScript' or 'Kubernetes'. Matches a " +
        "canonical name or any known alias — no fuzzy or semantic matching.",
    ),
});

/** `get-skill-evidence` — registered against a live `McpServer` via `defineTool`. */
export const getSkillEvidenceTool: ToolDefinition<typeof inputSchema, SkillEvidenceOutcome> = {
  name: "get-skill-evidence",
  description:
    "Looks up a single named skill or technology and reports one of three honest outcomes: " +
    "'claimed' (the skill with its supporting evidence), 'not-claimed' (an explicit, " +
    "acknowledged gap with its own statement and related skills), or 'unknown' (the term " +
    "matches neither). Use this when asked 'do you know X' or 'have you worked with Y' about " +
    "one specific technology. Do not use it to browse the full skill list (there is no such " +
    "tool in this server) or to search project descriptions for a keyword (use " +
    "search-projects instead), and it is not a substitute for get-experience when the " +
    "question is about a role or company rather than a single skill. A 'not-claimed' or " +
    "'unknown' result is a normal, successful answer, not an error — relay it honestly " +
    "rather than retrying or hallucinating around it.",
  inputSchema,
  handler: (input) => getSkillEvidence(getCareerDataRepository(), input.term),
};
