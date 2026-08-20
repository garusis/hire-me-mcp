// Lighthouse CI config (#58) — run against a real deployment (a Vercel
// preview in CI, or any base URL locally), not a local dev server.
//
// Run locally:
//
//   PREVIEW_URL=https://<preview>.vercel.app \
//   VERCEL_AUTOMATION_BYPASS_SECRET=<secret> \
//   pnpm test:lighthouse:preview
//
// `VERCEL_AUTOMATION_BYPASS_SECRET` is only required when the target has
// Vercel Deployment Protection on (every preview does).
const PREVIEW_URL = process.env.PREVIEW_URL;
const BYPASS_SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

if (!PREVIEW_URL) {
  throw new Error(
    "lighthouserc.cjs requires PREVIEW_URL to be set to the deployment under test, " +
      "e.g. `PREVIEW_URL=https://<preview>.vercel.app pnpm test:lighthouse:preview`.",
  );
}

const stripTrailingSlash = (url) => (url.endsWith("/") ? url.slice(0, -1) : url);
const base = stripTrailingSlash(PREVIEW_URL);

// Home (#28), one project detail page (#29) and /mcp (#43) — the three
// routes #58's acceptance criteria name explicitly.
const urls = [base || "/", `${base}/projects/cowork`, `${base}/mcp`];

const extraHeaders = BYPASS_SECRET
  ? {
      "x-vercel-protection-bypass": BYPASS_SECRET,
      "x-vercel-set-bypass-cookie": "true",
    }
  : undefined;

module.exports = {
  ci: {
    collect: {
      url: urls,
      // Median of >= 3 runs per URL, per #58's acceptance criteria.
      numberOfRuns: 3,
      settings: {
        preset: "desktop",
        // #44 deliberately makes every non-production deploy (every
        // preview) noindex — robots.txt disallows "/" and the page emits
        // <meta name="robots" content="noindex">, both by design, so a
        // preview is never confused with production in search results.
        // Lighthouse's "is-crawlable" SEO audit fails hard on exactly
        // that noindex signal, which would make the SEO category
        // unattainable against *any* preview regardless of real content
        // quality — skip only that one audit here; every other SEO audit
        // (meta description, canonical, headings, structured data, link
        // text, etc.) still runs and is asserted below.
        skipAudits: ["is-crawlable"],
        ...(extraHeaders ? { extraHeaders: JSON.stringify(extraHeaders) } : {}),
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.95 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["error", { minScore: 0.95 }],
        "categories:seo": ["error", { minScore: 0.95 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: "./.lighthouseci",
    },
  },
};
