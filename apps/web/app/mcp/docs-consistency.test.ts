import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPECTED_TOOL_NAMES } from "../../lib/mcp/tool-names";

/**
 * Drift guard for `docs/mcp.md` (#71): the doc is a hand-authored markdown
 * file, not generated from the tool registry the way `/mcp`'s page is
 * (`tool-catalogue.ts`, #43) — epic #7 will formalize real doc generation.
 * Until then, this test is the cheap substitute: it fails loudly if the doc
 * drifts from the two things most likely to go stale silently — the set of
 * tool names it documents, and the endpoint URL it tells people to paste.
 */

const DOCS_MCP_PATH = join(__dirname, "..", "..", "..", "..", "docs", "mcp.md");

/**
 * The one production MCP endpoint URL this doc should ever reference — the
 * same origin as the root README's "Live URL" (`hire-me-mcp-web.vercel.app`)
 * plus `apps/web/src/lib/config/site-url.ts`'s `MCP_ROUTE_PATH`
 * (`/api/mcp`). Hardcoded here rather than imported: this doc describes the
 * fixed production URL for a human reader, not whatever `getMcpEndpointUrl()`
 * resolves to in a given environment (which varies by preview deploy).
 */
const PRODUCTION_MCP_ENDPOINT_URL = "https://hire-me-mcp-web.vercel.app/api/mcp";

function readDocsMcp(): string {
  return readFileSync(DOCS_MCP_PATH, "utf-8");
}

describe("docs/mcp.md consistency (#71)", () => {
  it("documents every tool name in EXPECTED_TOOL_NAMES — the same list route.test.ts asserts the live server's tools/list against", () => {
    const doc = readDocsMcp();
    for (const name of EXPECTED_TOOL_NAMES) {
      expect(doc).toContain(`\`${name}\``);
    }
  });

  it("defines the endpoint URL as exactly one canonical markdown reference", () => {
    const doc = readDocsMcp();
    const definitions = [...doc.matchAll(/^\[mcp-endpoint\]:\s*(\S+)\s*$/gm)];
    expect(definitions).toHaveLength(1);
    expect(definitions[0]?.[1]).toBe(PRODUCTION_MCP_ENDPOINT_URL);
  });

  it("every literal occurrence of the MCP endpoint URL in the doc matches the one canonical value — no snippet has drifted", () => {
    const doc = readDocsMcp();
    const occurrences = [...doc.matchAll(/https:\/\/\S*\/api\/mcp/g)].map((match) =>
      match[0].replace(/[).,'"`]+$/, ""),
    );
    expect(occurrences.length).toBeGreaterThan(0);
    for (const url of occurrences) {
      expect(url).toBe(PRODUCTION_MCP_ENDPOINT_URL);
    }
  });

  it("links to the canonical rate-limits documentation instead of restating the numbers", () => {
    const doc = readDocsMcp();
    expect(doc).toContain("apps/web/README.md#rate-limiting");
    expect(doc).not.toMatch(/\b60\s+requests?\b/i);
  });
});
