import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Regression guard for #113: on Vercel, `/api/mcp` reads
 * `packages/career-data/content/**` via `fs` at request time through a
 * `node:path`-computed path (`resolveDefaultContentDir()` in
 * `packages/career-data/src/index.ts`) that's deliberately opaque to
 * webpack's static import analysis. Output file tracing can't see those
 * reads on its own, so without `outputFileTracingIncludes` in
 * `apps/web/next.config.ts`, the content JSON/MDX files silently drop out
 * of the route's serverless bundle — the function still boots, but every
 * MCP tool call returns an empty dataset (`unknown` skills,
 * `internal_error` on `get-profile`) in production while everything passes
 * locally, since local dev reads the real filesystem directly.
 *
 * This doesn't hit the route handler — mcp-handler's runtime doesn't
 * reflect which files Vercel would actually deploy, so a passing request
 * here wouldn't catch a broken trace. Instead it reads the `.nft.json`
 * (Node File Trace) manifest Next.js writes for the route during `next
 * build` — the same manifest Vercel's build step consumes to decide which
 * files ship in the deployed function — and asserts it lists at least one
 * `packages/career-data/content/**` file. The Playwright `webServer` in
 * `playwright.config.ts` already runs `next build` before this suite
 * executes, so the trace file is guaranteed to exist by the time this
 * test runs.
 */
test("api/mcp route trace includes career-data content files", async () => {
  const traceFilePath = path.join(
    import.meta.dirname,
    "..",
    ".next",
    "server",
    "app",
    "api",
    "mcp",
    "route.js.nft.json",
  );

  const raw = await readFile(traceFilePath, "utf-8");
  const trace: { files: string[] } = JSON.parse(raw);

  const contentFiles = trace.files.filter((file) => file.includes("packages/career-data/content/"));

  expect(
    contentFiles.length,
    `expected the /api/mcp route's file trace (${traceFilePath}) to include ` +
      `packages/career-data/content/** files, but found none among ` +
      `${trace.files.length} traced files. This means the MCP endpoint's ` +
      `serverless bundle would ship without its dataset — see #113. Check ` +
      `outputFileTracingIncludes in apps/web/next.config.ts.`,
  ).toBeGreaterThan(0);
});
