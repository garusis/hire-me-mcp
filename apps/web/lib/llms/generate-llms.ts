/**
 * Renders `/llms.txt` and `/llms-full.txt` (#37) — the site-side half of the
 * epic's "one inspect" north star (the repo-side half is the README, #23).
 *
 * Both `renderLlmsTxt` and `renderLlmsFullTxt` are pure functions of
 * `{ siteUrl, endpointUrl }`: every fact they emit is read straight from the
 * content layer (`src/lib/content/`, epic #2's domain layer) and from this
 * server's own MCP tool registry, via the same modules the rest of the site
 * already binds to (`lib/mcp/tool-catalogue.ts`, `lib/mcp/connection-metadata.ts`
 * — themselves derived from the real `ToolDefinition` objects registered in
 * `app/api/mcp/route.ts`). Nothing here re-types a tool name, description,
 * example prompt, or career fact.
 *
 * Serving decision (documented per the issue's request): `app/llms.txt/route.ts`
 * and `app/llms-full.txt/route.ts` call these functions with
 * `getSiteUrl()`/`getMcpEndpointUrl()` — the same per-deploy URL resolution
 * `/mcp`, `sitemap.ts` and `robots.ts` already use. Next renders both routes
 * dynamically (confirmed by `next build`'s route summary marking them `ƒ`,
 * the same as `/api/mcp`) because that resolution reads `process.env` at
 * request time; this is *more* fresh than static generation, not less —
 * every request recomputes the text from the live sources below. Either
 * way there is *zero* drift by construction: there is no committed output
 * file that can go stale, because there is no committed output file at
 * all. `scripts/generate-llms-cli.ts`'s `--check` mode (also required by
 * the AC) exists for a different failure mode than "stale committed file":
 * it catches generation itself throwing or drifting from the documented
 * conventions (size budget, tool coverage, absolute URLs) in CI, against
 * real production data, without a Next.js build.
 */

import "server-only";
import { buildClientSnippets } from "@hire-me-mcp/connect-metadata";
import { z } from "zod";
import {
  getCvView,
  getExperienceListView,
  getGapsListView,
  getProfileView,
  getProjectsListView,
  getSkillsListView,
} from "../../src/lib/content";
import {
  buildConnectionMetadata,
  SERVER_DESCRIPTION,
  SERVER_NAME,
} from "../mcp/connection-metadata";
import { MCP_TOOL_CATALOGUE } from "../mcp/tool-catalogue";
import { getExperienceTool } from "../mcp/tools/get-experience";
import { getProfileTool } from "../mcp/tools/get-profile";
import { getSkillEvidenceTool } from "../mcp/tools/get-skill-evidence";
import { pingTool } from "../mcp/tools/ping";
import { searchCareerTool } from "../mcp/tools/search-career";
import { searchProjectsTool } from "../mcp/tools/search-projects";

export interface LlmsRenderInput {
  /** The site's own absolute origin, e.g. `https://hire-me-mcp-web.vercel.app`. */
  siteUrl: string;
  /** The absolute public MCP endpoint URL. */
  endpointUrl: string;
}

/**
 * `llms.txt`'s documented size budget (#37's AC) — small enough that an
 * agent can read the whole file in one shot. Enforced by
 * `generate-llms.test.ts` and `scripts/generate-llms-cli.ts --check`.
 */
export const LLMS_TXT_SIZE_BUDGET_BYTES = 4096;

const REPO_URL = "https://github.com/garusis/hire-me-mcp";

const BLURB =
  "A public, anonymous Model Context Protocol (MCP) server exposing Marcos Alvarez's real " +
  "career data — profile, work history, projects, and skill evidence — as callable tools, " +
  "with every answer citing the record it was drawn from.";

const PORTFOLIO_AS_API_PARAGRAPH =
  "This site doubles as an MCP server: the same career facts rendered as pages here are also " +
  "exposed as structured tools an AI assistant can call directly, so an agent can look up who " +
  "Marcos is, what he's worked on, and whether he's used a given technology, without scraping " +
  "HTML.";

const ARCHITECTURE_OVERVIEW =
  "Architecture: packages/career-data holds the Zod-typed, citation-backed career content " +
  "(profile, experience, projects, skills and gaps). packages/core is the framework-free " +
  "domain layer that reads it and builds citations. apps/web is the Next.js site — both its " +
  "pages and this MCP server (app/api/mcp/route.ts) read career facts exclusively through " +
  "apps/web/src/lib/content/, never the raw dataset directly. packages/connect-metadata is the " +
  "single source of truth for how to connect to the MCP server, rendered here, on the /mcp " +
  "page, and into the repository's README and docs.";

function abs(siteUrl: string, path: string): string {
  return `${siteUrl}${path}`;
}

function linkLine(name: string, url: string, description: string): string {
  return `- [${name}](${url}): ${description}`;
}

function linkSection(heading: string, lines: string[]): string {
  return [`## ${heading}`, ...lines].join("\n");
}

function connectSection(siteUrl: string, endpointUrl: string): string {
  return linkSection("Connect", [
    linkLine(
      "MCP endpoint",
      endpointUrl,
      "Streamable HTTP MCP endpoint, no authentication required.",
    ),
    linkLine(
      "Full tool list, parameters and examples",
      abs(siteUrl, "/llms-full.txt"),
      "The expanded version of this file.",
    ),
    linkLine(
      "Add me to your AI",
      abs(siteUrl, "/mcp"),
      "Setup instructions for Claude Code, Claude Desktop, Cursor/VS Code and curl.",
    ),
  ]);
}

function siteSection(siteUrl: string): string {
  const { filename } = getCvView();
  return linkSection("Site", [
    linkLine("Home", siteUrl, "Overview and entry point."),
    linkLine("Experience", abs(siteUrl, "/experience"), "Full work history."),
    linkLine("Projects", abs(siteUrl, "/projects"), "Selected project write-ups."),
    linkLine("Skills", abs(siteUrl, "/skills"), "Claimed skills with evidence, and honest gaps."),
    linkLine("Writing", abs(siteUrl, "/writing"), "Longer-form notes."),
    linkLine(
      "Download CV (PDF)",
      abs(siteUrl, `/cv/${filename}`),
      "A print-ready, 1-2 page CV generated from the same career data.",
    ),
  ]);
}

function repoSection(): string {
  return linkSection("Repo", [
    linkLine("GitHub repository", REPO_URL, "Source code and architecture docs."),
  ]);
}

/**
 * `/llms.txt` — small, curated, following the llms.txt convention: H1,
 * blockquote summary, a prose paragraph, then `##` link sections where
 * every item is `[name](url): description`.
 */
export function renderLlmsTxt({ siteUrl, endpointUrl }: LlmsRenderInput): string {
  const sections = [connectSection(siteUrl, endpointUrl), siteSection(siteUrl), repoSection()];

  return [
    `# ${SERVER_NAME}`,
    "",
    `> ${BLURB}`,
    "",
    PORTFOLIO_AS_API_PARAGRAPH,
    "",
    sections.join("\n\n"),
  ].join("\n");
}

// --- llms-full.txt -----------------------------------------------------

/** Every registered tool's real input schema, keyed by name — never re-typed. */
const TOOL_INPUT_SCHEMAS: Record<string, z.ZodTypeAny> = {
  [pingTool.name]: pingTool.inputSchema,
  [getProfileTool.name]: getProfileTool.inputSchema,
  [getExperienceTool.name]: getExperienceTool.inputSchema,
  [searchProjectsTool.name]: searchProjectsTool.inputSchema,
  [getSkillEvidenceTool.name]: getSkillEvidenceTool.inputSchema,
  [searchCareerTool.name]: searchCareerTool.inputSchema,
};

function fieldDescription(field: z.ZodTypeAny): string | undefined {
  const target =
    field instanceof z.ZodOptional ? (field as z.ZodOptional<z.ZodTypeAny>).unwrap() : field;
  return target.description;
}

function describeField(name: string, field: z.ZodTypeAny): string {
  const optional = field.isOptional();
  const description = fieldDescription(field);
  const suffix = description ? ` — ${description}` : "";
  return `${name}${optional ? " (optional)" : ""}${suffix}`;
}

/** A one-line parameter summary for a tool's real Zod input schema — `"none"` for no params. */
function summarizeParams(schema: z.ZodTypeAny): string {
  if (!(schema instanceof z.ZodObject)) {
    return "none";
  }
  const entries = Object.entries(schema.shape) as [string, z.ZodTypeAny][];
  if (entries.length === 0) {
    return "none";
  }
  return entries.map(([name, field]) => describeField(name, field)).join("; ");
}

function paramSummaryFor(toolName: string): string {
  const schema = TOOL_INPUT_SCHEMAS[toolName];
  return schema ? summarizeParams(schema) : "none";
}

function toolEntry(tool: (typeof MCP_TOOL_CATALOGUE)[number]): string {
  return [
    `### ${tool.name}`,
    tool.description,
    `Parameters: ${paramSummaryFor(tool.name)}`,
    `Example prompt: "${tool.examplePrompt}"`,
  ].join("\n\n");
}

function toolsSection(): string {
  return ["## Tools", ...MCP_TOOL_CATALOGUE.map(toolEntry)].join("\n\n");
}

function examplePromptsSection(examplePrompts: readonly string[]): string {
  return ["## Example prompts", examplePrompts.map((prompt) => `- "${prompt}"`).join("\n")].join(
    "\n\n",
  );
}

function fenced(language: string, body: string): string {
  return `\`\`\`${language}\n${body}\n\`\`\``;
}

function connectionInstructionsSection(endpointUrl: string): string {
  const metadata = buildConnectionMetadata(endpointUrl);
  const snippets = buildClientSnippets(metadata);
  const byId = (id: string) => snippets.find((snippet) => snippet.id === id)?.snippet ?? "";

  return [
    "## Full connection instructions",
    `MCP endpoint: ${endpointUrl}`,
    "Transport: Streamable HTTP. Auth: none.",
    "Claude Code:",
    fenced("bash", byId("claude-code")),
    "VS Code / Cursor / Claude Desktop (JSON config):",
    fenced("json", byId("vscode-cursor")),
    "Raw JSON-RPC (curl):",
    fenced("bash", byId("curl-jsonrpc")),
  ].join("\n\n");
}

function experienceEntryLine(
  item: ReturnType<typeof getExperienceListView>["items"][number],
): string {
  const { entry } = item;
  const end = entry.endDate ?? "present";
  return `- **${entry.role} at ${entry.company}** (${entry.startDate} – ${end}): ${entry.summary}`;
}

function projectEntryLine(
  siteUrl: string,
  item: ReturnType<typeof getProjectsListView>["items"][number],
): string {
  const { project, slug } = item;
  return `- [${project.name}](${abs(siteUrl, `/projects/${slug}`)}): ${project.summary} (tech: ${project.tech.join(", ")})`;
}

function skillsByProficiency(skills: ReturnType<typeof getSkillsListView>["items"]): string {
  const labels: Record<(typeof skills)[number]["proficiency"], string> = {
    expert: "Expert",
    proficient: "Proficient",
    familiar: "Familiar",
  };
  return (["expert", "proficient", "familiar"] as const)
    .map((tier) => {
      const inTier = skills.filter((skill) => skill.proficiency === tier);
      if (inTier.length === 0) {
        return null;
      }
      const items = inTier.map((skill) => `- ${skill.name} (${skill.category})`).join("\n");
      return `**${labels[tier]}**\n\n${items}`;
    })
    .filter((section): section is string => section !== null)
    .join("\n\n");
}

function gapsLines(gaps: ReturnType<typeof getGapsListView>["items"]): string {
  return gaps.map((item) => `- **${item.gap.name}**: ${item.gap.statement}`).join("\n");
}

function careerSummarySection(siteUrl: string): string {
  const { profile } = getProfileView();
  const experience = getExperienceListView();
  const projects = getProjectsListView();
  const skills = getSkillsListView();
  const gaps = getGapsListView();

  return [
    "## Career summary",
    [
      "### Profile",
      `**${profile.name}** — ${profile.headline}. ${profile.location}. Availability: ${profile.availability}.`,
      profile.summary,
    ].join("\n\n"),
    ["### Experience", experience.items.map(experienceEntryLine).join("\n")].join("\n\n"),
    ["### Projects", projects.items.map((item) => projectEntryLine(siteUrl, item)).join("\n")].join(
      "\n\n",
    ),
    ["### Skills", skillsByProficiency(skills.items)].join("\n\n"),
    [
      "### Gaps — what's not claimed",
      "Recorded honestly, as first-class data rather than the absence of a skill record:",
      gapsLines(gaps.items),
    ].join("\n\n"),
  ].join("\n\n");
}

/**
 * `/llms-full.txt` — the expanded version: full project description, the
 * complete tool list with parameter summaries and example prompts (bound to
 * the live MCP tool registry, so adding a tool without updating this
 * function still shows it), the career summary rendered from the content
 * layer, an architecture overview, and the full connection instructions.
 */
export function renderLlmsFullTxt({ siteUrl, endpointUrl }: LlmsRenderInput): string {
  const metadata = buildConnectionMetadata(endpointUrl);

  const sections = [
    connectionInstructionsSection(endpointUrl),
    toolsSection(),
    examplePromptsSection(metadata.examplePrompts),
    careerSummarySection(siteUrl),
    ["## Architecture", ARCHITECTURE_OVERVIEW].join("\n\n"),
    linkSection("More", [
      linkLine(
        "Short version of this file",
        abs(siteUrl, "/llms.txt"),
        "The curated, size-budgeted entry point.",
      ),
      linkLine("GitHub repository", REPO_URL, "Source code and architecture docs."),
    ]),
  ];

  return [
    `# ${SERVER_NAME}`,
    "",
    `> ${BLURB}`,
    "",
    `${PORTFOLIO_AS_API_PARAGRAPH} ${SERVER_DESCRIPTION}`,
    "",
    sections.join("\n\n"),
  ].join("\n");
}
