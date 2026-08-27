import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // #235 — every HTML route here renders dynamically (the per-request CSP
  // nonce in `proxy.ts` forces it), and Next *streams* metadata on
  // dynamic routes for any user agent not matching `htmlLimitedBots`: the
  // `<title>`, canonical and og:/twitter: tags arrive as tags appended
  // ~20 KB into `<body>`, not in `<head>`. Browsers and JS-executing
  // crawlers cope; the link-preview scrapers a portfolio URL actually
  // travels through (Slack, LinkedIn, WhatsApp, iMessage) read only the
  // head or a byte-limited prefix and render a bare URL. The wildcard
  // treats every user agent as HTML-limited, disabling streaming metadata
  // entirely (per Next's own `htmlLimitedBots` docs) so metadata always
  // blocks into `<head>`. The TTFB cost is nil here: every
  // `generateMetadata` in this app is a synchronous read of the local
  // career-data content layer.
  htmlLimitedBots: /.*/,
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
    //
    // The `\\[slug\\]` escaping below is load-bearing as of Next 16: these
    // keys are matched as globs, and an unescaped `[slug]` reads as a
    // character class (one of `s`/`l`/`u`/`g`), so the literal `[slug]`
    // segment never matches and the entries silently do nothing — the
    // fonts vanished from both routes' `route.js.nft.json` on the first
    // Next 16 build, caught by `og-image-content-trace.smoke.spec.ts`.
    // Next 15 matched these keys literally, which is why they worked
    // unescaped before. Verified per-route: with the escaping, only the
    // two `[slug]` OG routes gain the font files; sibling routes' traces
    // are unchanged.
    "/projects/\\[slug\\]/opengraph-image": [
      "../../packages/career-data/content/**/*",
      "./assets/fonts/**/*",
    ],
    "/writing/\\[slug\\]/opengraph-image": [
      "../../packages/career-data/content/**/*",
      "./assets/fonts/**/*",
    ],
  },
  // #35 — the downloadable CV PDF is a plain static asset committed under
  // public/cv/<deterministic-filename>.pdf. It's committed rather than
  // generated during Vercel's own build: that build only builds/deploys
  // the Next.js app (see docs/deployment.md's "CI vs. Vercel" section, and
  // reindex-production.yml's doc comment for the same rationale applied
  // to the retrieval index) and doesn't ship headless-Chromium system
  // dependencies, so a build-time Playwright launch there would be a
  // fragile, environment-dependent way to fail an otherwise-healthy
  // deploy. `pnpm generate:cv` (README) regenerates it from current
  // career-data whenever content changes; commit the result the same way
  // `pnpm generate:connect` output is committed. `Content-Disposition:
  // attachment` with no `filename` parameter tells the browser to save-as
  // using the request URL's own last path segment — which is already the
  // deterministic, profile-name-derived filename `getCvView()` computed —
  // so this stays correct without duplicating that filename logic here.
  // Next's `headers()` applies to files served from `public/` the same as
  // any other route, so this needs no custom route handler or filesystem
  // tracing.
  async headers() {
    return [
      {
        source: "/cv/:file(.*\\.pdf)",
        headers: [
          { key: "Content-Disposition", value: "attachment" },
          { key: "Cache-Control", value: "public, max-age=3600, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
