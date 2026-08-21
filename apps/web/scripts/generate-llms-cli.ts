#!/usr/bin/env node
/**
 * `pnpm generate:llms` / `pnpm generate:llms --check` (#37).
 *
 * Unlike `generate-connect-cli.ts` (which injects rendered snippets into
 * committed marked regions in `docs/mcp.md`/`README.md`), `/llms.txt` and
 * `/llms-full.txt` are served by `app/llms.txt/route.ts` and
 * `app/llms-full.txt/route.ts` — route handlers that call
 * `lib/mcp/generate-llms.ts`'s pure render functions at request/build time,
 * straight off the content layer and the live MCP tool registry. There is
 * no committed output file, so there is nothing that can drift out of sync
 * with a stale copy on disk — the AC's "fails when the output is stale" has
 * no way to reproduce, by construction.
 *
 * What this script's `--check` mode verifies instead is that *generation
 * itself* stays valid: the llms.txt convention's structure, the size
 * budget, that every registered tool and endpoint URL still appear, and
 * that every emitted link is absolute — the same properties
 * `generate-llms.test.ts` asserts with mocked content, run here once
 * against the real, fully-wired production data so CI catches a violation
 * without needing a full `next build`. Always renders against the fixed
 * production URLs (`PRODUCTION_SITE_URL`/`PRODUCTION_MCP_ENDPOINT_URL`),
 * matching `generate-connect-cli.ts`'s convention for doc generation.
 *
 * Without `--check`, it just prints both rendered files to stdout — useful
 * for a human to preview the exact bytes the routes will serve.
 */

import {
  LLMS_TXT_SIZE_BUDGET_BYTES,
  renderLlmsFullTxt,
  renderLlmsTxt,
} from "../lib/llms/generate-llms";
import { EXPECTED_TOOL_NAMES } from "../lib/mcp/tool-names";
import { PRODUCTION_MCP_ENDPOINT_URL, PRODUCTION_SITE_URL } from "../src/lib/config/site-url";

const RENDER_INPUT = { siteUrl: PRODUCTION_SITE_URL, endpointUrl: PRODUCTION_MCP_ENDPOINT_URL };

function extractLinkUrls(text: string): string[] {
  return [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1] ?? "");
}

/** Structural checks for `llms.txt`: the convention shape plus its documented size budget. */
function checkLlmsTxt(text: string): string[] {
  const errors: string[] = [];
  const lines = text.split("\n");

  if (lines[0] !== "# hire-me-mcp") {
    errors.push('llms.txt: first line must be the H1 "# hire-me-mcp"');
  }
  if (lines.filter((line) => line.startsWith("# ")).length !== 1) {
    errors.push("llms.txt: must have exactly one H1");
  }
  if (!lines.some((line) => line.startsWith("> "))) {
    errors.push("llms.txt: missing a blockquote summary");
  }
  const listItems = lines.filter((line) => line.startsWith("- "));
  const malformed = listItems.filter((item) => !/^- \[[^\]]+\]\([^)]+\): .+$/.test(item));
  if (malformed.length > 0) {
    errors.push(
      `llms.txt: list items not in "[name](url): description" form: ${malformed.join(" | ")}`,
    );
  }
  const size = Buffer.byteLength(text, "utf-8");
  if (size > LLMS_TXT_SIZE_BUDGET_BYTES) {
    errors.push(`llms.txt: ${size} bytes exceeds the ${LLMS_TXT_SIZE_BUDGET_BYTES}-byte budget`);
  }

  return errors;
}

/** Structural checks for `llms-full.txt`: tool coverage and endpoint presence. */
function checkLlmsFullTxt(text: string): string[] {
  const errors: string[] = [];

  if (!text.includes(PRODUCTION_MCP_ENDPOINT_URL)) {
    errors.push("llms-full.txt: missing the MCP endpoint URL");
  }
  for (const toolName of EXPECTED_TOOL_NAMES) {
    if (!text.includes(toolName)) {
      errors.push(`llms-full.txt: missing tool "${toolName}" from the live registry`);
    }
  }

  return errors;
}

/** Every emitted markdown link must be absolute, in both files. */
function checkAbsoluteUrls(label: string, text: string): string[] {
  const relative = extractLinkUrls(text).filter((url) => !/^https?:\/\//.test(url));
  return relative.map((url) => `${label}: relative (non-absolute) URL emitted: "${url}"`);
}

function main(): void {
  const check = process.argv.includes("--check");

  const llmsTxt = renderLlmsTxt(RENDER_INPUT);
  const llmsFullTxt = renderLlmsFullTxt(RENDER_INPUT);

  if (!check) {
    console.log(llmsTxt);
    console.log("\n---\n");
    console.log(llmsFullTxt);
    return;
  }

  const errors = [
    ...checkLlmsTxt(llmsTxt),
    ...checkAbsoluteUrls("llms.txt", llmsTxt),
    ...checkLlmsFullTxt(llmsFullTxt),
    ...checkAbsoluteUrls("llms-full.txt", llmsFullTxt),
  ];

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    console.error("\ngenerate:llms --check failed.");
    process.exit(1);
  }

  console.log("generate:llms --check: llms.txt and llms-full.txt generation is valid.");
}

main();
