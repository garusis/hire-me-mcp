/**
 * Computes the `GeneratedRegion[]` the root `generate:connect` script
 * (`apps/web/scripts/generate-connect-cli.ts`) injects into `docs/mcp.md`
 * and the root `README.md` (#17) — the last link in the "single source of
 * truth" chain: `connection-metadata.ts` derives tool data from the real
 * registry, `@hire-me-mcp/connect-metadata`'s renderers turn that into
 * per-client snippets, and this module wraps those snippets in the exact
 * markdown shape each target file's marked region expects.
 *
 * Kept separate from the CLI script itself so this logic — pure functions
 * of an endpoint URL — is unit-testable without touching the filesystem.
 */

import {
  buildClientSnippets,
  type ClientId,
  type GeneratedRegion,
  type ToolInfo,
} from "@hire-me-mcp/connect-metadata";
import { buildConnectionMetadata } from "./connection-metadata";

function fenced(language: string, body: string): string {
  return `\`\`\`${language}\n${body}\n\`\`\``;
}

function findSnippet(snippets: ReturnType<typeof buildClientSnippets>, id: ClientId): string {
  const entry = snippets.find((snippet) => snippet.id === id);
  if (!entry) {
    throw new Error(`generate-connect: no "${id}" client snippet was rendered`);
  }
  return entry.snippet;
}

/** The tool reference table docs/mcp.md and README.md render — every registered tool except the `ping` diagnostic. */
function renderToolTable(tools: ToolInfo[]): string {
  const header = "| Tool | What it answers | Example question |\n| --- | --- | --- |";
  const rows = tools
    .filter((tool) => tool.name !== "ping")
    .map((tool) => `| \`${tool.name}\` | ${tool.description} | "${tool.examplePrompt}" |`)
    .join("\n");
  return `${header}\n${rows}`;
}

/** README.md's "What you can ask it" bullet list — one line per tool's real example prompt. */
function renderExamplePrompts(tools: ToolInfo[]): string {
  return tools
    .filter((tool) => tool.name !== "ping")
    .map((tool) => `- "${tool.examplePrompt}"`)
    .join("\n");
}

/** Regions for `docs/mcp.md`'s marked sections: endpoint, three client snippets, and the tool table. */
export function computeDocsMcpRegions(endpointUrl: string): GeneratedRegion[] {
  const metadata = buildConnectionMetadata(endpointUrl);
  const snippets = buildClientSnippets(metadata);

  return [
    { id: "mcp-endpoint-url", content: fenced("", metadata.endpointUrl) },
    {
      id: "mcp-claude-code-snippet",
      content: fenced("bash", findSnippet(snippets, "claude-code")),
    },
    {
      id: "mcp-cursor-vscode-snippet",
      content: fenced("json", findSnippet(snippets, "vscode-cursor")),
    },
    {
      id: "mcp-curl-jsonrpc-snippet",
      content: fenced("bash", findSnippet(snippets, "curl-jsonrpc")),
    },
    { id: "mcp-tool-table", content: renderToolTable(metadata.tools) },
  ];
}

/**
 * Regions for the root `README.md`'s marked sections (#23): the endpoint
 * URL, the two copy-paste snippets README's "Connect your agent in one
 * step" section leads with (Claude Code CLI, then the Cursor/VS Code JSON
 * shape), the example-prompts bullet list, and the tool table — all
 * derived from the same `ConnectionMetadata` docs/mcp.md renders from, so
 * README and docs/mcp.md can never disagree about what this server does.
 * README links to docs/mcp.md for the remaining per-client instructions
 * (Claude web/desktop, Claude Desktop JSON, curl JSON-RPC, troubleshooting)
 * rather than duplicating every renderer here.
 */
export function computeReadmeRegions(endpointUrl: string): GeneratedRegion[] {
  const metadata = buildConnectionMetadata(endpointUrl);
  const snippets = buildClientSnippets(metadata);

  return [
    { id: "mcp-endpoint-url", content: fenced("", metadata.endpointUrl) },
    {
      id: "mcp-claude-code-snippet",
      content: fenced("bash", findSnippet(snippets, "claude-code")),
    },
    {
      id: "mcp-cursor-vscode-snippet",
      content: fenced("json", findSnippet(snippets, "vscode-cursor")),
    },
    { id: "mcp-example-prompts", content: renderExamplePrompts(metadata.tools) },
    { id: "mcp-tool-table", content: renderToolTable(metadata.tools) },
  ];
}
