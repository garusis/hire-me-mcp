import { renderCvHtml } from "../../../lib/cv/render-cv-html";
import { getMcpEndpointUrl, getSiteUrl } from "../../../src/lib/config/site-url";
import { getCvView } from "../../../src/lib/content";

/**
 * `GET /cv/print` (#35) — the print-ready, browsable CV view: the same
 * `renderCvHtml()` output `scripts/generate-cv-pdf-cli.ts` renders
 * headlessly to produce the downloadable PDF, served here as real HTML so
 * it can be opened, print-previewed (Cmd/Ctrl+P) and visually reviewed in
 * an ordinary browser tab. Rendered fresh from the content layer on every
 * request — nothing here is a career fact of its own.
 *
 * The proxy (`proxy.ts`) forwards its per-request CSP nonce as the `x-nonce`
 * request header (see `apps/web/proxy.ts`); this handler stamps it on
 * the document's inline `<style>` so the nonce-scoped `style-src` policy
 * doesn't block the CV's own print CSS (#76 — found by the production
 * certification run: /cv/print rendered unstyled under the #42 headers).
 */
export async function GET(request: Request): Promise<Response> {
  const view = getCvView();
  const nonce = request.headers.get("x-nonce") ?? undefined;
  const html = renderCvHtml(view, { siteUrl: getSiteUrl(), mcpUrl: getMcpEndpointUrl(), nonce });
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
