import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Regression guard for #37, mirroring `mcp-content-trace.smoke.spec.ts`
 * (#113): `/llms.txt` and `/llms-full.txt` render dynamically (confirmed
 * via `next build`'s route table — both list as `ƒ`, not `○`/`●`) and read
 * `packages/career-data/content/**` through the exact same content-layer
 * path `/api/mcp` uses — `fs.readFileSync`/`readdirSync` calls opaque to
 * output file tracing's static analysis. Without the corresponding
 * `outputFileTracingIncludes` entries in `apps/web/next.config.ts`, both
 * routes would boot on Vercel but serve `llms.txt`/`llms-full.txt` built
 * from an empty dataset — the same failure mode #113 fixed for `/api/mcp`.
 *
 * Like its sibling, this reads each route's `.nft.json` (Node File Trace)
 * manifest directly rather than hitting the route handler, since a local
 * request can't distinguish "traced correctly" from "reads the real
 * filesystem directly in dev" the way Vercel's deployed function would.
 */
const routes = [
  { name: "llms.txt", segments: ["llms.txt"] },
  { name: "llms-full.txt", segments: ["llms-full.txt"] },
];

for (const route of routes) {
  test(`${route.name} route trace includes career-data content files`, async () => {
    const traceFilePath = path.join(
      import.meta.dirname,
      "..",
      ".next",
      "server",
      "app",
      ...route.segments,
      "route.js.nft.json",
    );

    const raw = await readFile(traceFilePath, "utf-8");
    const trace: { files: string[] } = JSON.parse(raw);

    const contentFiles = trace.files.filter((file) =>
      file.includes("packages/career-data/content/"),
    );

    expect(
      contentFiles.length,
      `expected the ${route.name} route's file trace (${traceFilePath}) to include ` +
        `packages/career-data/content/** files, but found none among ` +
        `${trace.files.length} traced files. This means the route's serverless bundle ` +
        `would ship without its dataset — see #37/#113. Check outputFileTracingIncludes ` +
        `in apps/web/next.config.ts.`,
    ).toBeGreaterThan(0);
  });
}
