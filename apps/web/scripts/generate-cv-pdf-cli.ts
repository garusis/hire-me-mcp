#!/usr/bin/env node
/**
 * `pnpm generate:cv` (#35).
 *
 * Build-time CV generation: renders the CV HTML (`lib/cv/render-cv-html.ts`)
 * straight from the content layer's `getCvView()` — no running Next.js
 * server required — and headlessly prints it to a PDF
 * (`lib/cv/generate-cv-pdf.ts`, Playwright/Chromium) at
 * `public/cv/<filename>.pdf`, where `<filename>` is the same deterministic,
 * profile-name-derived filename `getCvView()` computes (never a literal
 * here). `public/cv/` is cleared first so a stale file under a previous
 * name never lingers after a profile-name change.
 *
 * Deliberately NOT wired into Vercel's own build: that build only
 * builds/deploys the Next.js app and doesn't ship headless-Chromium
 * system dependencies (see `next.config.ts`'s doc comment on the `/cv`
 * headers, and `reindex-production.yml`'s doc comment for the same "don't
 * couple an unrelated, environment-dependent step to the deploy build"
 * rationale applied elsewhere in this repo). Run this locally (or in CI)
 * whenever `packages/career-data` content changes and commit the
 * resulting `public/cv/<filename>.pdf` — the same convention
 * `pnpm generate:connect`'s generated regions already follow.
 *
 * `CV_MODE=full` (#309 stage 1) switches `getCvView()` to the
 * "everything on the table" projection — every highlight, every role
 * summary, and every attached behavioral story, uncapped, with the #309
 * stage 3 CV-only overlay (`cv-overrides.json`) disabled so a
 * compact-line role can't collapse out of the dump and take its stories
 * with it — for the recruiter-advisor review this issue's Stage 2 runs
 * over. It still writes the same `public/cv/<filename>.pdf` (the
 * projection layer is the only thing that changes, per the issue's design
 * constraint), and additionally saves the intermediate HTML to
 * `docs/cv-review/<filename-base>.full.html` — `public/cv/` is a turbo
 * build output the CLI clears on every run, so a review artifact can't
 * live there. Any other value (or unset) keeps the default, capped "web"
 * projection unchanged.
 *
 * `CV_VARIANT=ai` (#309 stage 3, open question 2) switches the optimized
 * projection to the AI-adjacent variant — LLM/agentic depth leads the
 * summary, headline and House Numbers bullet order, and the header keeps
 * the MCP endpoint callout. The default (unset, or any other value) is
 * `general`, which stays the default downloadable PDF at the stable
 * `<filename>` the profile name derives; the `ai` variant writes to a
 * `-ai` suffixed filename instead so both can be generated and committed
 * side by side without one clobbering the other. `CV_VARIANT` has no
 * effect in full mode (Stage 1 is variant-agnostic by design: it dumps
 * everything, before any variant-specific selection happens), and it
 * likewise saves its HTML to `docs/cv-review/` for reviewer comparison
 * against the `.full.html` dump.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateCvPdf } from "../lib/cv/generate-cv-pdf";
import { renderCvHtml } from "../lib/cv/render-cv-html";
import { PRODUCTION_MCP_ENDPOINT_URL, PRODUCTION_SITE_URL } from "../src/lib/config/site-url";
import { type CvVariant, getCvView } from "../src/lib/content";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CV_OUTPUT_DIR = resolve(SCRIPT_DIR, "..", "public", "cv");
const CV_REVIEW_DIR = resolve(SCRIPT_DIR, "..", "..", "..", "docs", "cv-review");

const isFullMode = process.env.CV_MODE === "full";
const variant: CvVariant = process.env.CV_VARIANT === "ai" ? "ai" : "general";

/** `<slug>-cv.pdf` -> `<slug>-cv-ai.pdf` for the ai variant's own filename, never clobbering the general variant's. */
function filenameFor(baseFilename: string, requestedVariant: CvVariant): string {
  return requestedVariant === "ai" ? baseFilename.replace(/\.pdf$/, "-ai.pdf") : baseFilename;
}

async function main(): Promise<void> {
  const view = isFullMode
    ? getCvView(undefined, {
        maxHighlightsPerRole: Number.POSITIVE_INFINITY,
        includeSummary: true,
        includeStories: true,
        overrides: undefined,
      })
    : getCvView(undefined, { variant });
  const html = renderCvHtml(view, {
    siteUrl: PRODUCTION_SITE_URL,
    mcpUrl: PRODUCTION_MCP_ENDPOINT_URL,
  });

  // Clears only *this run's own* stale output (by extension), not the
  // whole directory: `pnpm generate:cv` (general) and
  // `CV_VARIANT=ai pnpm generate:cv` (ai) both write into public/cv/, and
  // one must not delete the other's PDF. A profile-name change still
  // can't leave a stale differently-named PDF behind, since this run's
  // own previous file (if renamed) simply stops being written and the
  // directory only ever holds the two current, correctly-named variants
  // plus whatever the other variant's most recent run wrote.
  mkdirSync(CV_OUTPUT_DIR, { recursive: true });

  const filename = isFullMode ? view.filename : filenameFor(view.filename, variant);
  const outputPath = join(CV_OUTPUT_DIR, filename);
  await generateCvPdf(html, outputPath);

  console.log(`generate:cv: wrote ${outputPath}`);

  if (isFullMode) {
    mkdirSync(CV_REVIEW_DIR, { recursive: true });
    const htmlFilename = `${view.filename.replace(/\.pdf$/, "")}.full.html`;
    const htmlOutputPath = join(CV_REVIEW_DIR, htmlFilename);
    writeFileSync(htmlOutputPath, html, "utf8");
    console.log(`generate:cv (CV_MODE=full): wrote ${htmlOutputPath}`);
  } else {
    mkdirSync(CV_REVIEW_DIR, { recursive: true });
    const htmlFilename = `${view.filename.replace(/\.pdf$/, "")}.${variant}.html`;
    const htmlOutputPath = join(CV_REVIEW_DIR, htmlFilename);
    writeFileSync(htmlOutputPath, html, "utf8");
    console.log(`generate:cv (variant=${variant}): wrote ${htmlOutputPath}`);
  }
}

main().catch((error) => {
  console.error(`generate:cv failed: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
