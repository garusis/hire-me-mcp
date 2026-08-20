/**
 * The tool catalogue rendered on `/mcp` (#43) — the marketing/documentation
 * surface for the server this file lives next to. Every entry's `name` and
 * `description` are read straight off the real `ToolDefinition` objects
 * registered in `app/api/mcp/route.ts`, never re-typed by hand, so the page
 * cannot silently drift from what the server actually answers with.
 *
 * The only hand-authored data here is `examplePrompt` — free text a visitor
 * could paste into their own assistant, which has no server-side
 * equivalent to derive from. If a new tool is registered without adding one
 * here, this module throws at import time (caught by
 * `tool-catalogue.test.ts` and, transitively, anything importing `/mcp`'s
 * page) rather than silently rendering an incomplete row.
 *
 * `tool-catalogue.test.ts` is the drift test the AC asks for: it asserts
 * this catalogue's tool names equal `EXPECTED_TOOL_NAMES` (the same list
 * `route.test.ts` asserts the live server's `tools/list` against) in the
 * same order, and that every description matches its real tool verbatim.
 */

import { getExperienceTool } from "./tools/get-experience";
import { getProfileTool } from "./tools/get-profile";
import { getSkillEvidenceTool } from "./tools/get-skill-evidence";
import { pingTool } from "./tools/ping";
import { searchProjectsTool } from "./tools/search-projects";

export interface ToolCatalogueEntry {
  name: string;
  description: string;
  examplePrompt: string;
}

/** Registered in the same order `app/api/mcp/route.ts` registers them. */
const REGISTERED_TOOLS = [
  pingTool,
  getProfileTool,
  getExperienceTool,
  searchProjectsTool,
  getSkillEvidenceTool,
];

const EXAMPLE_PROMPTS_BY_NAME: Record<string, string> = {
  ping: "Ping the hire-me-mcp server to make sure the connection works.",
  "get-profile": "Who is Marcos Alvarez, and is he currently open to new roles?",
  "get-experience": "What has Marcos worked on since 2022? Walk me through his recent roles.",
  "search-projects": "Show me projects where Marcos used TypeScript or Kubernetes.",
  "get-skill-evidence": "Has Marcos worked with event-driven architectures? Show me the evidence.",
};

function examplePromptFor(toolName: string): string {
  const prompt = EXAMPLE_PROMPTS_BY_NAME[toolName];
  if (!prompt) {
    throw new Error(
      `tool-catalogue.ts has no example prompt for MCP tool "${toolName}" — the tool catalogue ` +
        "on /mcp must cover every registered tool. Add one to EXAMPLE_PROMPTS_BY_NAME.",
    );
  }
  return prompt;
}

/** Rendered by `app/mcp/page.tsx` — see the module docstring for how this stays in sync. */
export const MCP_TOOL_CATALOGUE: ToolCatalogueEntry[] = REGISTERED_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  examplePrompt: examplePromptFor(tool.name),
}));
