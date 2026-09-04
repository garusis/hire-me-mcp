/**
 * `get-cv-presentation` — thin adapter over `packages/core`'s
 * `getCvPresentation(repository, options?)` (#315, follow-up to #309).
 * Exposes the exact CV-overlay-merged presentation `apps/web`'s own CV
 * renderer consumes (`getCvView()`), so a client reading career facts
 * through this public MCP can also read the curated, recruiter-facing
 * wording without a repo checkout. This handler applies no filtering,
 * reshaping, or rewording of its own (#31) — every field, and every
 * citation, passes through exactly as the domain service returned it.
 */

import { getCvPresentation } from "@hire-me-mcp/core";
import { z } from "zod";
import { educationEntrySchema } from "../../../src/lib/content/entity-schemas";
import { getCareerDataRepository } from "../../../src/lib/content/repository";
import { enumValueMessage, type ToolDefinition } from "../define-tool";
import { toolSuccessSchema } from "../wire-schemas";

/**
 * Derived from `getCvPresentation`'s own return type rather than importing
 * `GetCvPresentationData` from `@hire-me-mcp/core` directly for the
 * `outputSchema` below — apps/web reads career content only through
 * `src/lib/content/` (issue #16, enforced by biome); the handler's own
 * input/output types still come straight from `@hire-me-mcp/core`.
 */
type GetCvPresentationData = ReturnType<typeof getCvPresentation>["data"];

const CV_VARIANTS = ["general", "ai"] as const;

const inputSchema = z.object({
  variant: z
    .enum(CV_VARIANTS, {
      error: (issue) => enumValueMessage([...CV_VARIANTS], issue.input),
    })
    .optional()
    .describe(
      "Which CV audience to build: 'general' (default) leads with full-stack range; 'ai' leads " +
        "with LLM/agentic depth for AI-tooling-company postings. Both project the same " +
        "canonical dataset — only selection, order, and CV-only wording vary. English only; " +
        "there is no Spanish variant on this server.",
    ),
});

/** One project link, matching `Project.links[].label`/`url` (#232). */
const linkSchema = z.object({
  label: z.string().min(1).describe("Link label, e.g. 'GitHub' or 'MCP endpoint'."),
  url: z.url().describe("The link's target URL."),
});

const experienceEntrySchema = z.object({
  id: z
    .string()
    .describe("Canonical experience id — cross-reference get-experience for the full role record."),
  company: z.string().describe("Company name."),
  role: z.string().describe("Role title."),
  startDate: z.string().describe("Role start (YYYY-MM)."),
  endDate: z.string().optional().describe("Role end (YYYY-MM); omitted for a current role."),
  bullets: z
    .array(z.string())
    .describe(
      "This role's CV highlights for the requested variant — the CV-only overlay's bullets " +
        "when authored for this role, falling back to canonical highlights otherwise. See the " +
        "matching citation's fragment ('bullets' vs 'bullets.cv-overrides') for which.",
    ),
  tech: z.array(z.string()).describe("Technology tags for this role, resolved to display names."),
  compactLine: z
    .string()
    .optional()
    .describe(
      "When set, the CV collapses this role into one 'Earlier Experience' line with this " +
        "description instead of a full entry with bullets.",
    ),
  keepTogether: z
    .boolean()
    .optional()
    .describe("When true, the CV renders this role's block without a page break inside it."),
  displayLine: z
    .string()
    .describe(
      "Pre-formatted '<role>, <company> (<period>)' one-liner, so a consumer never has to " +
        "format the date range itself.",
    ),
});

const skillEntrySchema = z.object({
  id: z
    .string()
    .describe("Canonical skill id — cross-reference list-skills for proficiency and evidence."),
  name: z
    .string()
    .describe("CV display name for this skill (a CV-only override, or the canonical name)."),
});

const skillGroupSchema = z.object({
  category: z.string().describe("The skill category this group represents."),
  label: z
    .string()
    .describe("CV display label for this category (a CV-only override, or the category itself)."),
  skills: z.array(skillEntrySchema).describe("This category's skills, in CV display order."),
});

const projectEntrySchema = z.object({
  id: z
    .string()
    .describe("Canonical project id — cross-reference search-projects for the full write-up."),
  name: z.string().describe("Project name."),
  role: z.string().describe("The author's role on the project."),
  summary: z
    .string()
    .describe(
      "This project's CV summary — a CV-only override when authored, else the canonical summary.",
    ),
  links: z
    .array(linkSchema)
    .describe("This project's links, minus any the overlay excludes from the CV."),
});

const educationPresentationSchema = educationEntrySchema.and(
  z.object({
    displayLine: z
      .string()
      .optional()
      .describe(
        "Replaces the rendered institution/credential line when set — a CV-only override; the " +
          "canonical credential above is unchanged.",
      ),
  }),
);

/** `{ data, citations }` envelope around the CV presentation (#242). */
const outputSchema = toolSuccessSchema(
  z.object({
    variant: z.enum(CV_VARIANTS).describe("Which CV audience this presentation was built for."),
    headline: z.string().describe("The CV's displayed headline for this variant."),
    summary: z.string().describe("The CV's displayed summary for this variant."),
    timezoneLine: z
      .string()
      .optional()
      .describe("CV-only time-zone/availability clause; omitted when none is authored."),
    experience: z
      .array(experienceEntrySchema)
      .describe("Work history entries as shown on the CV, most recent first."),
    projects: z
      .array(projectEntrySchema)
      .describe("Projects shown on the CV, featured-first, filtered by the overlay's visibility."),
    skillGroups: z
      .array(skillGroupSchema)
      .describe("Skills grouped by category, in CV display order for this variant."),
    education: z
      .array(educationPresentationSchema)
      .describe("Education entries as shown on the CV."),
  }),
);

/** `get-cv-presentation` — registered against a live `McpServer` via `defineTool`. */
export const getCvPresentationTool: ToolDefinition<typeof inputSchema, GetCvPresentationData> = {
  name: "get-cv-presentation",
  title: "Get CV presentation",
  description:
    "Returns Marcos Alvarez's curated CV presentation — the exact recruiter-facing view model " +
    "the generated CV PDF renders from: headline, summary, and an optional time-zone clause " +
    "for the requested variant; work-history entries with CV-selected highlight bullets, " +
    "resolved tech tags, and a pre-formatted display line; projects visible on the CV with " +
    "their CV summary; skills grouped and labeled the way the CV presents them; and education " +
    "entries with any CV-only display-line override. Every entry carries its canonical id " +
    "(cross-reference get-experience, list-skills, search-projects, or list-education for the " +
    "full underlying record), and every citation resolves to that canonical entity — citations " +
    "for headline/summary/bullets/project-summary/education-line carry a 'cv-overrides' " +
    "fragment suffix wherever the displayed wording came from the CV-only overlay rather than " +
    "being the canonical text verbatim. Use this to render a CV-style summary of Marcos, to " +
    "compare general vs. AI-focused framing, or to answer 'what does his CV say'. Do not use " +
    "it for the raw canonical work history or skill inventory (use get-experience/list-skills " +
    "directly) or for behavioral stories (use list-career-stories) — this tool's wording is " +
    "curated presentation, not the full canonical record. English only; there is no Spanish " +
    "variant on this server. The 'general' variant is used when 'variant' is omitted.",
  inputSchema,
  outputSchema,
  handler: (input) => getCvPresentation(getCareerDataRepository(), { variant: input.variant }),
};
