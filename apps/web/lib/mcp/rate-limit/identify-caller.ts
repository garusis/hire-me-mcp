/**
 * Client-identifier extraction for per-IP rate limiting (#39).
 *
 * Header precedence, documented deliberately rather than incidentally:
 *
 * 1. `x-forwarded-for` — on Vercel's edge network this header is
 *    overwritten with the true connecting client IP before the request
 *    reaches this function. Vercel's own docs state it "overwrites this
 *    header and does not forward external IPs to prevent IP spoofing"
 *    (https://vercel.com/docs/headers/request-headers#x-forwarded-for),
 *    unless a paid Enterprise "trusted proxy" is configured — not the case
 *    for this project. A client cannot inject an arbitrary value here on
 *    Vercel. The value can still be a comma-separated list (general proxy
 *    convention); the FIRST entry is taken, which on Vercel is the client's
 *    own IP.
 * 2. `x-real-ip` — Vercel documents this header as "identical to
 *    x-forwarded-for" (same source, same trust level); consulted only as a
 *    fallback for a hypothetical future proxy layer that sets one but not
 *    the other.
 * 3. A fixed identifier (`"unknown"`) when neither header carries a usable
 *    value — e.g. local `next dev`/`next start` with no proxy in front. This
 *    intentionally buckets all such traffic behind ONE shared limit instead
 *    of exempting it, so local tooling can't run unlimited against a real
 *    Redis instance by omitting headers. It is not a security boundary on
 *    its own (unlike the Vercel-fronted case above, this path IS spoofable
 *    by a client that controls its own headers) — but there is no untrusted
 *    public deployment of this endpoint without Vercel's edge in front, so
 *    that doesn't matter in practice.
 *
 * No other client-supplied header (`x-client-ip`, `cf-connecting-ip`, etc.)
 * is consulted: this project has no CDN/WAF in front of Vercel that would
 * set one trustworthily, and honoring an arbitrary client-settable header
 * would let any caller choose their own rate-limit bucket, defeating the
 * limiter entirely.
 */

const UNKNOWN_CALLER_IDENTIFIER = "unknown";

function firstForwardedForEntry(headerValue: string): string | undefined {
  for (const entry of headerValue.split(",")) {
    const trimmed = entry.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

/** Extracts a stable per-caller identifier from a request's headers. See module docs for precedence. */
export function identifyCaller(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  const fromForwardedFor = forwardedFor ? firstForwardedForEntry(forwardedFor) : undefined;
  if (fromForwardedFor) return fromForwardedFor;

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return UNKNOWN_CALLER_IDENTIFIER;
}
