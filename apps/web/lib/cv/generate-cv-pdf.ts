/**
 * Headless HTML->PDF rendering for the CV (#35), via Playwright's Chromium
 * — already a repo dependency for the e2e harness (epic #1), reused here
 * rather than adding a second rendering engine. Takes a fully-rendered
 * HTML string (see `render-cv-html.ts`) rather than navigating to a live
 * URL: no Next.js server needs to be running for build/CI-time generation,
 * which keeps `scripts/generate-cv-pdf-cli.ts` a plain, fast, offline step
 * wired into the build pipeline (turbo.json's `@hire-me-mcp/web#build`
 * dependency) rather than requiring a `next start` process to be up.
 */

import { chromium } from "@playwright/test";

/** Zero margin on every side — page size (Letter) and margin (0.7in) are owned entirely by the `@page` rule in `render-cv-html.ts`'s print CSS. */
const PDF_MARGIN = { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" };

/**
 * Renders `html` to a PDF at `outputPath` using headless Chromium.
 * `printBackground: true` so the print CSS's background accents and
 * `print-color-adjust: exact` actually show up in the output. Page size
 * and margins are left to the HTML's own `@page` rule rather than
 * Playwright's `format`/`margin` options, so there is exactly one place
 * (`render-cv-html.ts`) that owns page geometry.
 */
export async function generateCvPdf(html: string, outputPath: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.pdf({
      path: outputPath,
      printBackground: true,
      preferCSSPageSize: true,
      margin: PDF_MARGIN,
    });
  } finally {
    await browser.close();
  }
}
