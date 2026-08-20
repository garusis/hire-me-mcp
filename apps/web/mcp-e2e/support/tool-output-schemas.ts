/**
 * Structural output validation for each career tool's `structuredContent`.
 *
 * None of the five tools registered in `app/api/mcp/route.ts` currently
 * declares a Zod `outputSchema` on its `ToolDefinition` (see
 * `lib/mcp/define-tool.ts` — the field is optional, and every tool in
 * `lib/mcp/tools/` omits it today), so `tools/list` never advertises a wire
 * `outputSchema`, and the MCP SDK client therefore performs no automatic
 * output validation of its own. Rather than silently skip AC 4 ("validates
 * against the tool's declared output schema") this module builds the
 * closest honest equivalent: the real `@hire-me-mcp/career-data` Zod
 * schemas (`profileSchema`, `experienceEntrySchema`, `projectSchema`,
 * `citationSchema`) — the actual shape every domain-service `DomainResult`
 * is built from (`packages/core/src/result.ts`) — wrapped in the
 * `{ data, citations }` envelope every tool result carries
 * (`lib/mcp/envelope.ts`). This validates the real contract without
 * asserting exact career content strings (out of scope per the issue).
 *
 * Adding real per-tool `outputSchema`s to `lib/mcp/tools/*.ts` so the wire
 * protocol advertises them too is a reasonable follow-up, tracked as a
 * documented deviation in the #49 PR rather than folded into this suite.
 */
import {
  citationSchema,
  experienceEntrySchema,
  profileSchema,
  projectSchema,
} from "@hire-me-mcp/career-data";
import { z } from "zod";

const citationsSchema = z.array(citationSchema);

/** `get-profile` result: a single Profile plus citations. */
export const getProfileOutputSchema = z.object({
  data: profileSchema,
  citations: citationsSchema,
});

/** `get-experience` result: a list of ExperienceEntry plus citations. */
export const getExperienceOutputSchema = z.object({
  data: z.array(experienceEntrySchema),
  citations: citationsSchema,
});

/**
 * `search-projects` result: ranked `{ project, score, matches }` entries.
 * `matches` (a match explanation) is intentionally left as `z.unknown()`
 * here — its exact shape is a `packages/core` implementation detail this
 * suite deliberately doesn't pin down; only its presence as an array is
 * asserted structurally alongside the well-formed `project`/`score`.
 */
export const searchProjectsOutputSchema = z.object({
  data: z.array(
    z.object({
      project: projectSchema,
      score: z.number(),
      matches: z.array(z.unknown()),
    }),
  ),
  citations: citationsSchema,
});

/**
 * `get-skill-evidence` result: the discriminated union outcome
 * (`claimed` / `not-claimed` / `unknown`) plus citations. Mirrors
 * `packages/core/src/get-skill-evidence.ts`'s `SkillEvidenceOutcome`
 * without importing it directly (apps/web reads career content only
 * through `src/lib/content/`, and this suite validates the wire shape, not
 * the internal type).
 */
export const getSkillEvidenceOutputSchema = z.object({
  data: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("claimed"),
      skill: z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        aliases: z.array(z.string()),
        category: z.string().min(1),
        proficiency: z.enum(["familiar", "proficient", "expert"]),
        evidence: citationsSchema,
      }),
      evidence: citationsSchema,
    }),
    z.object({
      kind: z.literal("not-claimed"),
      gap: z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        aliases: z.array(z.string()),
        statement: z.string().min(1),
        relatedSkills: z.array(z.string()),
      }),
      relatedSkills: z.array(
        z.object({
          skill: z.object({ id: z.string().min(1), name: z.string().min(1) }).passthrough(),
          evidence: citationsSchema,
        }),
      ),
    }),
    z.object({
      kind: z.literal("unknown"),
      term: z.string().min(1),
    }),
  ]),
  citations: citationsSchema,
});
