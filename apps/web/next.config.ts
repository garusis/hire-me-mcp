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
  // (#44) need the same treatment, for the same underlying reason plus one
  // more: unlike `/projects/[slug]` and `/writing/[slug]` (which export
  // `generateStaticParams` and are prerendered at build time — see
  // `page.tsx` in each directory), the two `opengraph-image.tsx` files
  // don't export `generateStaticParams` themselves, so Next.js builds them
  // as fully dynamic routes (confirmed via `next build`'s route table: `ƒ`,
  // not `●`) that run in the Vercel Lambda on every request rather than
  // being prerendered as static images at build time — unlike the
  // build-time-static root `/opengraph-image`, which never hits this code
  // path in production at all. At request time each route calls
  // `getProjectDetailView()`/`getWritingEntryView()` (career-data content)
  // and `loadOgFonts()` (reads `apps/web/assets/fonts/*.ttf` via
  // `import.meta.url`, see `src/lib/seo/og-fonts.ts`) — neither of which
  // NFT picked up automatically (confirmed: `route.js.nft.json` for both
  // routes traced 0 `career-data/content` and 0 `assets/fonts` files
  // before this change), so `resolveDefaultContentDir()`'s "fail loud"
  // guard (#115) throws and the route 500s (#119). This traces both the
  // content and the font files in explicitly, the same way `/api/mcp`
  // already needed for its content reads.
  outputFileTracingIncludes: {
    "/api/mcp": ["../../packages/career-data/content/**/*"],
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
