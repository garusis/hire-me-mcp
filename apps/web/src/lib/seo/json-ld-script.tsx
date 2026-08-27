/**
 * Renders a JSON-LD `<script type="application/ld+json">` tag from a
 * structured-data object built by `json-ld.ts`. `data` is always a
 * `JSON.stringify`-able plain object this server derives from the content
 * layer — never raw user input — so `dangerouslySetInnerHTML` here is the
 * standard, safe way to emit JSON-LD (same rationale as the theme script in
 * `app/layout.tsx`).
 *
 * `nonce` (#42) is the per-request CSP nonce proxy.ts generates and
 * every caller reads via `(await headers()).get("x-nonce")` — required so
 * this inline script is permitted under the nonce-scoped `style-src`/
 * `script-src` policy without an `unsafe-inline` fallback.
 */
export function JsonLdScript({ data, nonce }: { data: object; nonce?: string | null }) {
  return (
    <script
      type="application/ld+json"
      nonce={nonce ?? undefined}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: server-derived JSON-LD built from the content layer, not user input — the standard way to emit a structured-data script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
