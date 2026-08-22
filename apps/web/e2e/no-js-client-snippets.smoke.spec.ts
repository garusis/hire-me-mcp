import {
  type BuildConnectionMetadataInput,
  buildClientSnippets,
  buildConnectionMetadata,
  renderClaudeCodeSnippet,
  renderMcpServersJson,
} from "@hire-me-mcp/connect-metadata";
import { expect, test } from "@playwright/test";

/**
 * Regression guard for #154: `ClientTabs` (`app/mcp/client-tabs.tsx`) used
 * to conditionally mount only the selected tab's panel, so a plain HTTP
 * fetch of the server-rendered HTML — a `curl`, a WebFetch-style agent, any
 * crawler that doesn't execute JS — only ever saw the default client's
 * ("Claude (web/desktop)") setup snippet. Cursor, Claude Code, and the
 * generic-client instructions were invisible to exactly the class of tool
 * most likely to do a first inspection (see #153/#66's onboarding
 * verification and the linked issue for the full story).
 *
 * This test does a raw `request.get()` — Playwright's APIRequestContext,
 * which never launches a browser page or runs JS, the same shape of fetch a
 * non-JS agent would make — against the production build's `/` and `/mcp`
 * routes, and asserts every client's own snippet text is present in the raw
 * HTML body.
 *
 * The snippet fixtures are never hand-typed here: they come straight off
 * `@hire-me-mcp/connect-metadata` — `buildClientSnippets` for the home
 * page's Connect panel (the exact function `app/page.tsx` calls) and the
 * same per-client renderer functions `app/mcp/client-setups.ts` calls for
 * `/mcp` (`renderClaudeCodeSnippet`, `renderMcpServersJson`; `/mcp`'s
 * "Claude (web/desktop)" and "Generic" entries are the bare endpoint URL,
 * same as home's). `serverName` and `endpointUrl` are read out of the live
 * page itself (never hardcoded) so this test can't silently assert a stale
 * value if either changes.
 *
 * `app/mcp/client-setups.ts` and `lib/mcp/connection-metadata.ts` can't be
 * imported directly from this file: both pull in `src/lib/content/
 * repository.ts`, which is guarded by the real `server-only` package —
 * fine inside a Next.js server build or Vitest (which aliases it away, see
 * `vitest.setup.server-only.ts`), but this suite runs under Playwright's
 * plain Node runtime with no such alias, so importing that chain throws at
 * module load. Building metadata from `@hire-me-mcp/connect-metadata`
 * directly (a framework-free package with no such dependency) avoids that
 * without weakening what's asserted — the renderers are the actual single
 * source of truth every page's snippet ultimately comes from.
 *
 * React escapes `"` as `&quot;` in server-rendered text nodes (confirmed
 * against the real `next build` output for `/mcp`'s Cursor JSON snippet),
 * so raw-HTML comparison first decodes the handful of HTML entities that
 * show up in these snippets — mirroring what any real text-extraction agent
 * (strip tags, decode entities) would see, not literal wire bytes.
 */

const ENDPOINT_URL_PATTERN = /https?:\/\/[^\s"'<]+\/api\/mcp/;
const CLAUDE_CODE_COMMAND_PATTERN = /claude mcp add --transport http (\S+) https?:\/\/\S+/;

const HTML_ENTITIES: Record<string, string> = {
  "&quot;": '"',
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&#39;": "'",
  "&#x27;": "'",
};

function decodeHtmlEntities(html: string): string {
  let decoded = html;
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    decoded = decoded.split(entity).join(char);
  }
  return decoded;
}

function extractEndpointUrl(html: string): string {
  const match = ENDPOINT_URL_PATTERN.exec(html);
  if (!match) {
    throw new Error("expected the MCP endpoint URL to appear in the raw HTML, found none");
  }
  return match[0];
}

/** Reads the real server name off the rendered Claude Code CLI command, rather than hardcoding it. */
function extractServerName(html: string): string {
  const match = CLAUDE_CODE_COMMAND_PATTERN.exec(html);
  if (!match?.[1]) {
    throw new Error(
      "expected the Claude Code CLI command (claude mcp add --transport http <name> <url>) " +
        "to appear in the raw HTML, found none",
    );
  }
  return match[1];
}

/**
 * Placeholder tools — `buildConnectionMetadata` requires at least 3
 * distinct example prompts (its schema's floor), but none of the
 * per-client snippet renderers this test exercises read `tools` or
 * `examplePrompts` at all.
 */
function stubConnectionMetadataInput(
  serverName: string,
  endpointUrl: string,
): BuildConnectionMetadataInput {
  return {
    serverName,
    description: "stub description for #154's no-JS snippet-visibility test",
    endpointUrl,
    tools: [
      { name: "stub-tool-1", description: "stub tool", examplePrompt: "stub prompt one" },
      { name: "stub-tool-2", description: "stub tool", examplePrompt: "stub prompt two" },
      { name: "stub-tool-3", description: "stub tool", examplePrompt: "stub prompt three" },
    ],
  };
}

function assertEverySnippetPresent(
  decodedHtml: string,
  items: ReadonlyArray<{ label: string; snippet: string }>,
) {
  for (const item of items) {
    expect(
      decodedHtml.includes(item.snippet),
      `expected the raw (entity-decoded) HTML to include the "${item.label}" client's snippet:\n${item.snippet}`,
    ).toBe(true);
  }
}

test("/ (home Connect panel) — every client's snippet from buildClientSnippets is present in the raw server-rendered HTML, not just the default tab's", async ({
  request,
}) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const html = decodeHtmlEntities(await response.text());

  const endpointUrl = extractEndpointUrl(html);
  const serverName = extractServerName(html);
  const metadata = buildConnectionMetadata(stubConnectionMetadataInput(serverName, endpointUrl));
  const snippets = buildClientSnippets(metadata);
  // Sanity check the fixture itself isn't accidentally trivial — the whole
  // point of #154 is that there's more than one client tab to hide.
  expect(snippets.length).toBeGreaterThan(1);

  assertEverySnippetPresent(html, snippets);
});

test("/mcp — every client's snippet (rendered via the same connect-metadata functions client-setups.ts calls) is present in the raw server-rendered HTML, not just the default tab's", async ({
  request,
}) => {
  const response = await request.get("/mcp");
  expect(response.ok()).toBe(true);
  const html = decodeHtmlEntities(await response.text());

  const endpointUrl = extractEndpointUrl(html);
  const serverName = extractServerName(html);
  const metadata = buildConnectionMetadata(stubConnectionMetadataInput(serverName, endpointUrl));

  // Mirrors app/mcp/client-setups.ts's buildClientSetups: same four
  // clients, same renderer calls for each — "Claude (web/desktop)" and
  // "Generic" are the bare endpoint URL, "Claude Code" and "Cursor" go
  // through the shared connect-metadata renderers.
  const setups = [
    { label: "Claude (web/desktop)", snippet: metadata.endpointUrl },
    { label: "Claude Code", snippet: renderClaudeCodeSnippet(metadata) },
    { label: "Cursor", snippet: renderMcpServersJson(metadata) },
    { label: "Generic MCP client", snippet: metadata.endpointUrl },
  ];
  expect(setups.length).toBeGreaterThan(1);

  assertEverySnippetPresent(html, setups);
});
