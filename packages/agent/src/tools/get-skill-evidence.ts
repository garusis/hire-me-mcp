/**
 * `get-skill-evidence` — thin Mastra adapter over `packages/core`'s
 * `getSkillEvidence(term)`. Same domain service the MCP server's
 * `get-skill-evidence` tool wraps
 * (`apps/web/lib/mcp/tools/get-skill-evidence.ts`). The honesty-critical
 * tool: a "not-claimed" (gap) or "unknown" outcome is a normal, successful
 * result, never converted to an empty list or an error (#64, mirroring #32).
 */

import { getSkillEvidence } from "@hire-me-mcp/core";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { withCitationMarkers } from "./citation-markers.js";
import { getAgentCareerDataRepository } from "./repository.js";

/** Bounded length: model-driven input from untrusted visitor text. */
export const getSkillEvidenceInputSchema = z
  .object({
    term: z
      .string()
      .min(1)
      .max(200)
      .describe(
        "Skill or technology name to look up, e.g. 'TypeScript' or 'Kubernetes'. Matches a " +
          "canonical name or any known alias — no fuzzy or semantic matching.",
      ),
  })
  .strict();

/** `get-skill-evidence` — registered on the interview agent's tool set. */
export const getSkillEvidenceTool = createTool({
  id: "get-skill-evidence",
  description:
    "Looks up a single named skill or technology and reports one of three honest outcomes: " +
    "'claimed' (the skill with its supporting evidence), 'not-claimed' (an explicit, " +
    "acknowledged gap with its own statement and related skills), or 'unknown' (the term " +
    "matches neither). Use this when asked 'do you know X' or 'have you worked with Y' about " +
    "one specific technology. Do not use it to browse the full skill list (there is no such " +
    "tool) or to search project descriptions for a keyword (use search-projects instead), and " +
    "it is not a substitute for get-experience when the question is about a role or company " +
    "rather than a single skill. A 'not-claimed' or 'unknown' result is a normal, successful " +
    "answer, not an error — relay it honestly rather than retrying or hallucinating around it.",
  inputSchema: getSkillEvidenceInputSchema,
  execute: async (input) =>
    withCitationMarkers(getSkillEvidence(getAgentCareerDataRepository(), input.term)),
});
