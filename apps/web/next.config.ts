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
  outputFileTracingIncludes: {
    "/api/mcp": ["../../packages/career-data/content/**/*"],
  },
};

export default nextConfig;
