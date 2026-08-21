import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkGeneratedRegions } from "@hire-me-mcp/connect-metadata";
import { describe, expect, it } from "vitest";
import { computeDocsMcpRegions } from "../../lib/mcp/generate-connect";
import { EXPECTED_TOOL_NAMES } from "../../lib/mcp/tool-names";
import { PRODUCTION_MCP_ENDPOINT_URL } from "../../src/lib/config/site-url";

/**
 * Drift guard for `docs/mcp.md` (#71 -> #17). Originally a hand-rolled
 * regex-based substitute (see git history) written before real doc
 * generation existed; #17 built that generation mechanism
 * (`lib/mcp/generate-connect.ts` + `@hire-me-mcp/connect-metadata`'s marker
 * injector) and the "generated regions match a fresh render" describe block
 * below is now the real enforcement — the same check `generate:connect
 * --check` runs in CI. The original assertions are kept rather than
 * removed (protected test cases, and they're still true, covering the
 * whole document rather than just the marked regions) but no longer need
 * to invent their own hardcoded endpoint URL: `PRODUCTION_MCP_ENDPOINT_URL`
 * is the same single source of truth `connection-metadata.ts` derives from.
 */

const DOCS_MCP_PATH = join(__dirname, "..", "..", "..", "..", "docs", "mcp.md");

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

describe("docs/mcp.md generated regions (#17)", () => {
  it("has no stale generated region — every marked section matches a fresh render from the real tool registry and PRODUCTION_MCP_ENDPOINT_URL", () => {
    const doc = readDocsMcp();
    const regions = computeDocsMcpRegions(PRODUCTION_MCP_ENDPOINT_URL);
    const { drifted } = checkGeneratedRegions(doc, regions);
    expect(drifted).toEqual([]);
  });
});
