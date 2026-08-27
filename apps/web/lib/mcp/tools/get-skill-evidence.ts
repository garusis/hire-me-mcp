/**
 * `get-skill-evidence` — thin adapter over `packages/core`'s
 * `getSkillEvidence(term)`. The honesty-critical tool in this server: a
 * "not-claimed" (gap) or "unknown" outcome is a normal, successful result,
 * never converted to an empty list or an error (#32).
 */

import { getSkillEvidence } from "@hire-me-mcp/core";
import { z } from "zod";
import { gapSchema, skillSchema } from "../../../src/lib/content/entity-schemas";
import { getCareerDataRepository } from "../../../src/lib/content/repository";
import { nonEmptyStringMessage, type ToolDefinition } from "../define-tool";
import { dataCitationSchema, toolSuccessSchema } from "../wire-schemas";

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
    .min(1, { error: () => nonEmptyStringMessage() })
    .describe(
      "Skill or technology name to look up, e.g. 'TypeScript' or 'Kubernetes'. Matches a " +
        "canonical name or any known alias — no fuzzy or semantic matching.",
    ),
});

/** A skill record as embedded in an outcome - no raw evidence array; the outcome-level `evidence` is canonical (#245). */
const skillSummarySchema = skillSchema.omit({ evidence: true });

/** `{ data, citations }` envelope around the three-way discriminated outcome (#242). */
const outputSchema = toolSuccessSchema(
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("claimed"),
      skill: skillSummarySchema.describe("The resolved claimed skill record."),
      evidence: z
        .array(dataCitationSchema)
        .describe("Citations backing the claim - the one canonical evidence list."),
    }),
    z.object({
      kind: z.literal("not-claimed"),
      gap: gapSchema.describe("The explicit, authored gap record, statement verbatim."),
      relatedSkills: z
        .array(
          z.object({
            skill: skillSummarySchema.describe("An adjacent claimed skill."),
            evidence: z.array(dataCitationSchema).describe("Citations backing that skill."),
          }),
        )
        .describe("The gap's adjacent claimed skills with their evidence."),
    }),
    z.object({
      kind: z.literal("unknown"),
      term: z.string().describe("The unrecognized term, echoed back."),
    }),
  ]),
);

/** `get-skill-evidence` — registered against a live `McpServer` via `defineTool`. */
export const getSkillEvidenceTool: ToolDefinition<typeof inputSchema, SkillEvidenceOutcome> = {
  name: "get-skill-evidence",
  title: "Get skill evidence",
  description:
    "Looks up a single named skill or technology and reports one of three honest outcomes: " +
    "'claimed' (the skill with its supporting evidence), 'not-claimed' (an explicit, " +
    "acknowledged gap with its own statement and related skills), or 'unknown' (the term " +
    "matches neither). Use this when asked 'do you know X' or 'have you worked with Y' about " +
    "one specific technology. Do not use it to browse the full skill list (use list-skills) " +
    "or the full gap list (use list-gaps), or to search project descriptions for a keyword (use " +
    "search-projects instead), and it is not a substitute for get-experience when the " +
    "question is about a role or company rather than a single skill. A 'not-claimed' or " +
    "'unknown' result is a normal, successful answer, not an error — relay it honestly " +
    "rather than retrying or hallucinating around it.",
  inputSchema,
  outputSchema,
  handler: (input) => getSkillEvidence(getCareerDataRepository(), input.term),
};
