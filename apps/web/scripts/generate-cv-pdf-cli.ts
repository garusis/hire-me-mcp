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
 */

import { mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateCvPdf } from "../lib/cv/generate-cv-pdf";
import { renderCvHtml } from "../lib/cv/render-cv-html";
import { PRODUCTION_SITE_URL } from "../src/lib/config/site-url";
import { getCvView } from "../src/lib/content";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CV_OUTPUT_DIR = resolve(SCRIPT_DIR, "..", "public", "cv");

async function main(): Promise<void> {
  const view = getCvView();
  const html = renderCvHtml(view, { siteUrl: PRODUCTION_SITE_URL });

  rmSync(CV_OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(CV_OUTPUT_DIR, { recursive: true });

  const outputPath = join(CV_OUTPUT_DIR, view.filename);
  await generateCvPdf(html, outputPath);

  console.log(`generate:cv: wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(`generate:cv failed: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
