/**
 * Vercel Deployment Protection bypass header (mirrors
 * `apps/web/e2e-preview/helpers/bypass.ts`, duplicated here rather than
 * imported because this script lives outside the pnpm workspace, at the
 * repo root, same convention as `scripts/ci/verify-readme-local-dev.mjs`).
 * A no-op against an unprotected origin (production, or a local server) —
 * every docs-rot check that reaches the network applies this unconditionally.
 * Never logs the secret's value.
 */
const BYPASS_HEADER = "x-vercel-protection-bypass";
const BYPASS_SECRET_ENV = "VERCEL_AUTOMATION_BYPASS_SECRET";

export function bypassHeaders(env = process.env) {
  const secret = env[BYPASS_SECRET_ENV];
  return secret && secret.length > 0 ? { [BYPASS_HEADER]: secret } : {};
}
