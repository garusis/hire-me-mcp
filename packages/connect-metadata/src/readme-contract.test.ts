/**
 * Contract tests for the root `README.md` rewrite (#23) — the acceptance
 * criteria that aren't already covered by `generate:connect --check`
 * (README's generated regions matching the real MCP tool registry, tested
 * in `apps/web/lib/mcp/generate-connect.test.ts`). These assert static
 * properties of the committed file itself: the first-screenful facts an
 * agent handed only the repo URL needs, that the one hardcoded MCP
 * endpoint URL lives inside a generated region (never duplicated by hand
 * elsewhere), that documented env vars never carry secret-looking values,
 * and that every path in the architecture map actually exists on disk.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SRC_DIR, "..", "..", "..");
const README_PATH = resolve(REPO_ROOT, "README.md");
const MCP_ENDPOINT_URL = "https://hire-me-mcp-web.vercel.app/api/mcp";

function readReadme(): string {
  return readFileSync(README_PATH, "utf-8");
}

function firstNLines(source: string, n: number): string {
  return source.split("\n").slice(0, n).join("\n");
}

describe("README.md first screenful (#23 AC: what-this-is + live URLs within 20 lines)", () => {
  it("states what the project is, the live site URL, and the live MCP endpoint URL within the first 20 lines", () => {
    const head = firstNLines(readReadme(), 20);
    expect(head).toMatch(/model context protocol|MCP server/i);
    expect(head).toContain("https://hire-me-mcp-web.vercel.app");
    expect(head).toContain(MCP_ENDPOINT_URL);
  });
});

describe("README.md generated regions (#23 AC: no hardcoded endpoint outside a generated region)", () => {
  it("defines a BEGIN/END GENERATED marker pair for the endpoint URL region", () => {
    const source = readReadme();
    expect(source).toContain("<!-- BEGIN GENERATED: mcp-endpoint-url -->");
    expect(source).toContain("<!-- END GENERATED: mcp-endpoint-url -->");
  });

  it("never mentions the production MCP endpoint URL outside a generated region's marked span", () => {
    const source = readReadme();
    const outsideGeneratedRegions = source.replace(
      /<!-- BEGIN GENERATED:[^>]*-->[\s\S]*?<!-- END GENERATED:[^>]*-->/g,
      "",
    );
    expect(outsideGeneratedRegions).not.toContain(MCP_ENDPOINT_URL);
  });
});

describe("README.md environment variables (#23 AC: names only, no secret-looking values)", () => {
  // A value looks like a secret if it's a recognizable API-key prefix, a JWT,
  // or a long unbroken alphanumeric/base64-ish run — the kind of thing that
  // is never a safe illustrative default (numbers, "google"/"anthropic",
  // empty).
  const SECRET_LOOKING_VALUE =
    /=\s*(sk-|AIza|ghp_|gho_|xox[baprs]-|eyJ)\S+|=\s*[A-Za-z0-9+/_-]{24,}(?!\s*[\w.])/;

  it("has no line matching a known secret-value pattern", () => {
    const source = readReadme();
    for (const line of source.split("\n")) {
      expect(line).not.toMatch(SECRET_LOOKING_VALUE);
    }
  });
});

/**
 * Reconstructs each leaf path from the indented tree (top-level dirs end in
 * "/", their children are two-space-indented lines starting with a path
 * segment before whitespace-padded prose).
 */
function extractTreePaths(tree: string): string[] {
  const paths: string[] = [];
  let currentTop = "";
  for (const rawLine of tree.split("\n")) {
    if (rawLine.trim() === "") continue;
    const topMatch = rawLine.match(/^(\S+\/)\s*/);
    if (topMatch?.[1] && !rawLine.startsWith(" ")) {
      currentTop = topMatch[1];
      continue;
    }
    const childMatch = rawLine.match(/^\s{2}(\S+\/)\s+/);
    if (childMatch?.[1] && currentTop) {
      paths.push(`${currentTop}${childMatch[1]}`);
    }
  }
  return paths;
}

describe("README.md architecture map (#23 AC: every listed path exists on disk)", () => {
  it("lists paths that all resolve to real files or directories in this workspace", () => {
    const source = readReadme();
    const archSectionMatch = source.match(/## Architecture map\n([\s\S]*?)\n## /);
    expect(archSectionMatch, "README.md must have an '## Architecture map' section").not.toBeNull();
    const archSection = archSectionMatch?.[1] ?? "";

    const codeBlockMatch = archSection.match(/```\n([\s\S]*?)```/);
    expect(
      codeBlockMatch,
      "the architecture map section must contain a fenced tree",
    ).not.toBeNull();
    const tree = codeBlockMatch?.[1] ?? "";

    const paths = extractTreePaths(tree);

    expect(paths.length).toBeGreaterThan(0);
    for (const relativePath of paths) {
      const absolutePath = resolve(REPO_ROOT, relativePath);
      expect(
        existsSync(absolutePath),
        `${relativePath} (resolved: ${absolutePath}) must exist`,
      ).toBe(true);
    }
  });
});
