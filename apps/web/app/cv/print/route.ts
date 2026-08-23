import { renderCvHtml } from "../../../lib/cv/render-cv-html";
import { getSiteUrl } from "../../../src/lib/config/site-url";
import { getCvView } from "../../../src/lib/content";

/**
 * `GET /cv/print` (#35) — the print-ready, browsable CV view: the same
 * `renderCvHtml()` output `scripts/generate-cv-pdf-cli.ts` renders
 * headlessly to produce the downloadable PDF, served here as real HTML so
 * it can be opened, print-previewed (Cmd/Ctrl+P) and visually reviewed in
 * an ordinary browser tab. Rendered fresh from the content layer on every
 * request — nothing here is a career fact of its own.
 */
export async function GET(): Promise<Response> {
  const view = getCvView();
  const html = renderCvHtml(view, { siteUrl: getSiteUrl() });
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
