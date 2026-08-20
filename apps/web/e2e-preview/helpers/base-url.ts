/**
 * Resolves the target origin for the preview gate suite (#58).
 *
 * Unlike `playwright.config.ts` (root), this suite never boots its own
 * server — it always points at an already-running deployment (a Vercel
 * preview in CI, or any arbitrary URL locally: a preview, production, or a
 * `pnpm test:e2e` production build on `http://127.0.0.1:3100`). The base
 * URL is never hardcoded so the same spec files run unmodified against any
 * of those targets — see `apps/web/README.md#preview-gates` for the
 * documented local commands.
 */

/** Reads `BASE_URL`, trimming a trailing slash so path concatenation never double-slashes. */
export function resolveBaseUrl(): string {
  const raw = process.env.BASE_URL;
  if (!raw) {
    throw new Error(
      "BASE_URL is not set. The preview gate suite targets an already-deployed origin, not a " +
        "server it boots itself — set BASE_URL to the target, e.g.:\n" +
        "  BASE_URL=http://127.0.0.1:3100 pnpm test:e2e:preview   # against a local production build\n" +
        "  BASE_URL=https://<preview>.vercel.app pnpm test:e2e:preview   # against a Vercel preview\n" +
        "See apps/web/README.md#preview-gates.",
    );
  }
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}
