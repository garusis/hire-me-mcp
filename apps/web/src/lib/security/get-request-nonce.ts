import { headers } from "next/headers";

/**
 * Reads the per-request CSP nonce `middleware.ts` set on the `x-nonce`
 * request header (#42), for passing to `next/script`'s `nonce` prop or
 * `JsonLdScript`'s `nonce` prop — the only two places this app renders an
 * inline `<script>` tag. `null` on any route the middleware doesn't nonce
 * (the `/api/*` group), which is never a route that renders one of these.
 */
export async function getRequestNonce(): Promise<string | null> {
  const requestHeaders = await headers();
  return requestHeaders.get("x-nonce");
}
