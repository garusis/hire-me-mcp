import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Regression guard for #119: `/projects/[slug]/opengraph-image` returned
 * HTTP 500 on Vercel while passing against a local production build,
 * exactly the class of bug `mcp-content-trace.smoke.spec.ts` guards for
 * `/api/mcp` (#113/#114) — a Node File Trace gap that only manifests once
 * deployed, since local dev reads the real filesystem directly.
 *
 * Two things made this route (and its sibling
 * `/writing/[slug]/opengraph-image`) fall into that gap where the
 * sibling `/opengraph-image` (root) does not:
 *
 * 1. Like `/api/mcp`, both routes read `packages/career-data/content/**`
 *    via `getProjectDetailView()`/`getWritingEntryView()`, which bottoms
 *    out in `resolveDefaultContentDir()` — the same cwd-probing, NFT-opaque
 *    path resolution #113 fixed for `/api/mcp`, and just as blind to NFT
 *    here.
 * 2. Unlike `/projects/[slug]` and `/writing/[slug]` (which export
 *    `generateStaticParams` and are prerendered as static HTML at build
 *    time — see each directory's `page.tsx`), neither
 *    `opengraph-image.tsx` exports `generateStaticParams` itself, so
 *    Next.js builds them as fully dynamic routes (`next build`'s route
 *    table lists them as `ƒ`, not `●`) that execute in the Vercel Lambda
 *    on every request — unlike the root `/opengraph-image`, which is
 *    build-time-static (`○`) and never runs this code path in production
 *    at all. That's why only the `[slug]` OG routes were affected.
 *
 * They also read font binaries from `apps/web/assets/fonts/*.ttf` via
 * `loadOgFonts()` (`src/lib/seo/og-fonts.ts`), which NFT dropped from the
 * same trace for the same reason.
 *
 * This reads each route's `.nft.json` (Node File Trace) manifest — the
 * same manifest Vercel's build step consumes to decide which files ship
 * in the deployed function — and asserts it lists both
 * `packages/career-data/content/**` and `assets/fonts/**` files. The
 * Playwright `webServer` in `playwright.config.ts` already runs
 * `next build` before this suite executes, so the trace files are
 * guaranteed to exist by the time this test runs.
 */
const ogImageRoutes = [
  { name: "projects/[slug]", segments: ["projects", "[slug]", "opengraph-image"] },
  { name: "writing/[slug]", segments: ["writing", "[slug]", "opengraph-image"] },
];

for (const route of ogImageRoutes) {
  test(`${route.name} opengraph-image route trace includes content + font files`, async () => {
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
    const fontFiles = trace.files.filter((file) => file.includes("assets/fonts/"));

    expect(
      contentFiles.length,
      `expected the ${route.name} opengraph-image route's file trace (${traceFilePath}) ` +
        `to include packages/career-data/content/** files, but found none among ` +
        `${trace.files.length} traced files. This means the route's serverless bundle ` +
        `would ship without its dataset and 500 at request time — see #119. Check ` +
        `outputFileTracingIncludes in apps/web/next.config.ts.`,
    ).toBeGreaterThan(0);

    expect(
      fontFiles.length,
      `expected the ${route.name} opengraph-image route's file trace (${traceFilePath}) ` +
        `to include apps/web/assets/fonts/** files, but found none among ` +
        `${trace.files.length} traced files. This means loadOgFonts() would throw at ` +
        `request time in the deployed function — see #119. Check ` +
        `outputFileTracingIncludes in apps/web/next.config.ts.`,
    ).toBeGreaterThan(0);
  });
}
