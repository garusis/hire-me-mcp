import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The `/api/mcp` route reads `packages/career-data/content/**` via `fs`
  // at request time, through a `node:path`-computed path
  // (`resolveDefaultContentDir()` in `packages/career-data/src/index.ts`)
  // that's deliberately opaque to webpack's static import analysis (see
  // that function's docstring). Output file tracing can't see those reads,
  // so without this the content JSON/MDX files are dropped from the
  // route's serverless bundle on Vercel — the route still boots (the
  // content directory logic degrades to "no files found", not a crash),
  // but every dataset comes back empty (#113). This tells Next to trace
  // them in explicitly.
  //
  // `/projects/[slug]/opengraph-image` and `/writing/[slug]/opengraph-image`
  // (#44, #119) originally needed the same treatment for the same
  // underlying reason: without their own `generateStaticParams`, both
  // built as fully dynamic routes (`ƒ` in `next build`'s route table) that
  // ran in a Vercel Lambda on every request, where they called
  // `getProjectDetailView()`/`getWritingEntryView()` (career-data content)
  // and `loadOgFonts()` (`apps/web/assets/fonts/*.ttf`) — neither of which
  // NFT picked up automatically for these routes. That entry alone,
  // though, did not fix production (round 1, PR #127) — the live Lambda
  // still 500'd after deploy despite a local `next build`'s
  // `route.js.nft.json` proving the trace locally, which means local NFT
  // output isn't a reliable proxy for what Vercel's own build pipeline
  // actually ships for this route type. Round 2's real fix is in
  // `app/projects/[slug]/opengraph-image.tsx` and
  // `app/writing/[slug]/opengraph-image.tsx` themselves: both now export
  // `generateStaticParams` (mirroring their `page.tsx` siblings), so both
  // routes prerender as static images at build time (`●`, confirmed via
  // `next build`'s route table listing every known slug) — no Lambda runs
  // for them at request time at all for the common case, sidestepping
  // this whole class of tracing gap the same way the already-static root
  // `/opengraph-image` always has.
  //
  // These two entries are kept, not removed, because `dynamicParams`
  // defaults to `true`: a request for a slug outside `generateStaticParams`
  // (e.g. a newly authored entry hit before the next deploy) still falls
  // back to an on-demand Lambda render, which hits the exact same
  // content/font reads as before. So this remains load-bearing for that
  // fallback path — see `og-image-content-trace.smoke.spec.ts`, which
  // still asserts against `route.js.nft.json` (the build-time function
  // Next also uses to prerender the static images) and continues to pass.
  outputFileTracingIncludes: {
    "/api/mcp": ["../../packages/career-data/content/**/*"],
    // `/llms.txt` and `/llms-full.txt` (#37) render dynamically (`ƒ` in
    // `next build`'s route table, confirmed locally) and read career-data
    // content through the exact same content-layer -> packages/core ->
    // fs.readFileSync/readdirSync path as `/api/mcp` — the same opacity to
    // output file tracing that #113 fixed there. Included proactively
    // rather than after a production 500, per that fix's own lesson
    // ("local NFT output isn't a reliable proxy for what Vercel's own
    // build pipeline actually ships for this route type" — see the
    // opengraph-image entries below and #119).
    "/llms.txt": ["../../packages/career-data/content/**/*"],
    "/llms-full.txt": ["../../packages/career-data/content/**/*"],
    "/projects/[slug]/opengraph-image": [
      "../../packages/career-data/content/**/*",
      "./assets/fonts/**/*",
    ],
    "/writing/[slug]/opengraph-image": [
      "../../packages/career-data/content/**/*",
      "./assets/fonts/**/*",
    ],
  },
};

export default nextConfig;
