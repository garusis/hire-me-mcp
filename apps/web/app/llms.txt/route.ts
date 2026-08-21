import { renderLlmsTxt } from "../../lib/llms/generate-llms";
import { getMcpEndpointUrl, getSiteUrl } from "../../src/lib/config/site-url";

/**
 * `GET /llms.txt` (#37) — the curated llms.txt entry point, rendered fresh
 * from the content layer and the live MCP tool registry on every request.
 * See `lib/llms/generate-llms.ts`'s module doc for the serving/drift
 * decision this route is part of.
 */
export async function GET(): Promise<Response> {
  const text = renderLlmsTxt({ siteUrl: getSiteUrl(), endpointUrl: getMcpEndpointUrl() });
  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
